const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const Order = require("../models/order.model");
const { requireAuth } = require("../middlewares/auth.middleware");

function getBaseCandidates(rawBaseUrl) {
  const base = String(rawBaseUrl || "").replace(/\/$/, "");
  const candidates = [base];

  if (base.includes("/apis/hermes")) {
    candidates.push(base.replace("/apis/hermes", "/apis/pg"));
    candidates.push(base.replace("/apis/hermes", "/apis"));
  }

  if (base.includes("/apis/pg")) {
    candidates.push(base.replace("/apis/pg", "/apis/hermes"));
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function postPayWithFallback(baseUrl, body, headers) {
  const candidates = getBaseCandidates(baseUrl);
  let lastError;

  for (const candidate of candidates) {
    try {
      return await axios.post(`${candidate}/pg/v1/pay`, body, { headers });
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function getStatusWithFallback(
  baseUrl,
  merchantId,
  merchantTransactionId,
  headers,
) {
  const candidates = getBaseCandidates(baseUrl);
  let lastError;

  for (const candidate of candidates) {
    try {
      return await axios.get(
        `${candidate}/pg/v1/status/${merchantId}/${merchantTransactionId}`,
        { headers },
      );
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError;
}

router.post("/initiate", requireAuth, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const dbOrder = await Order.findById(orderId);

    if (!dbOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (String(dbOrder.user) !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized for this order",
      });
    }

    if (dbOrder.paymentStatus === "PAID") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX;

    if (
      !merchantId ||
      !saltKey ||
      !saltIndex ||
      !process.env.PHONEPE_BASE_URL
    ) {
      return res.status(500).json({
        success: false,
        message: "PhonePe env vars are missing",
      });
    }

    const amountInPaise = Math.round(Number(dbOrder.totalAmount) * 100);

    if (!amountInPaise || amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    const merchantTransactionId =
      dbOrder.merchantTransactionId || `TXN_${Date.now()}`;

    dbOrder.merchantTransactionId = merchantTransactionId;
    dbOrder.paymentMethod = "ONLINE";
    await dbOrder.save();

    const frontendUrl = (
      process.env.FRONTEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: String(dbOrder.user),
      amount: amountInPaise,
      redirectUrl: `${frontendUrl}/payment-success?orderId=${dbOrder._id}&merchantTransactionId=${merchantTransactionId}`,
      redirectMode: "REDIRECT",
      callbackUrl: process.env.PHONEPE_CALLBACK_URL,
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
      "base64",
    );
    const stringToSign = `${payloadBase64}/pg/v1/pay${saltKey}`;
    const checksum =
      crypto.createHash("sha256").update(stringToSign).digest("hex") +
      "###" +
      saltIndex;

    const response = await postPayWithFallback(
      process.env.PHONEPE_BASE_URL,
      { request: payloadBase64 },
      {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
      },
    );

    const redirectUrl =
      response?.data?.data?.instrumentResponse?.redirectInfo?.url || null;

    if (!redirectUrl) {
      return res.status(400).json({
        success: false,
        message:
          response?.data?.message || "PhonePe did not return redirect url",
        code: response?.data?.code || "PHONEPE_REDIRECT_MISSING",
      });
    }

    res.json({
      success: true,
      data: {
        orderId: String(dbOrder._id),
        merchantTransactionId,
        redirectUrl,
      },
    });
  } catch (error) {
    const providerError = error?.response?.data || null;
    console.error("PhonePe Initiate Error:", providerError || error);

    res.status(500).json({
      success: false,
      message: providerError?.message || "Payment initiation failed",
      code: providerError?.code || "PHONEPE_INITIATE_ERROR",
      hint:
        providerError?.code === "404"
          ? "PhonePe base URL may be incorrect for your account mode. Check PHONEPE_BASE_URL in deployed env."
          : undefined,
    });
  }
});

router.post("/verify", requireAuth, async (req, res) => {
  try {
    const { orderId, merchantTransactionId } = req.body;

    if (!orderId || !merchantTransactionId) {
      return res.status(400).json({
        success: false,
        message: "orderId and merchantTransactionId are required",
      });
    }

    const dbOrder = await Order.findById(orderId);

    if (!dbOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (String(dbOrder.user) !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized for this order",
      });
    }

    if (dbOrder.merchantTransactionId !== merchantTransactionId) {
      return res.status(400).json({
        success: false,
        message: "merchantTransactionId does not match order",
      });
    }

    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX;

    const stringToSign = `/pg/v1/status/${merchantId}/${merchantTransactionId}${saltKey}`;
    const checksum =
      crypto.createHash("sha256").update(stringToSign).digest("hex") +
      "###" +
      saltIndex;

    const response = await getStatusWithFallback(
      process.env.PHONEPE_BASE_URL,
      merchantId,
      merchantTransactionId,
      {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": merchantId,
      },
    );

    const statusData = response?.data || {};
    const txnState = statusData?.data?.state;
    const isPaid =
      statusData?.success === true &&
      (txnState === "COMPLETED" || statusData?.code === "PAYMENT_SUCCESS");

    if (isPaid) {
      dbOrder.paymentStatus = "PAID";
      dbOrder.paymentMethod = "ONLINE";
      dbOrder.orderStatus = "CONFIRMED";
      dbOrder.isCompleted = false;
      dbOrder.paidAt = new Date();
      await dbOrder.save();

      return res.json({
        success: true,
        message: "Payment verified successfully",
        data: {
          orderId: String(dbOrder._id),
          paymentStatus: dbOrder.paymentStatus,
          state: txnState,
        },
      });
    }

    if (dbOrder.paymentStatus !== "PAID") {
      dbOrder.paymentStatus = "FAILED";
      await dbOrder.save();
    }

    return res.status(400).json({
      success: false,
      message: "Payment not completed",
      data: {
        orderId: String(dbOrder._id),
        paymentStatus: dbOrder.paymentStatus,
        state: txnState,
      },
    });
  } catch (error) {
    console.error("PhonePe Verify Error:", error?.response?.data || error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
});

router.post("/callback", async (req, res) => {
  try {
    // Keep callback endpoint available for PhonePe server callbacks.
    return res.status(200).send("OK");
  } catch (error) {
    console.error("PhonePe Callback Error:", error);
    return res.status(500).send("ERROR");
  }
});

module.exports = router;
