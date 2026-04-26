const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../models/order.model");
const { requireAuth } = require("../middlewares/auth.middleware");

let phonePeAuthTokenCache = {
  accessToken: null,
  expiresAtEpochMs: 0,
};

function getPhonePeBaseUrl() {
  return String(
    process.env.PHONEPE_BASE_URL || "https://api.phonepe.com/apis/pg",
  ).replace(/\/$/, "");
}

function getPhonePeTokenUrl() {
  return String(
    process.env.PHONEPE_AUTH_URL || `${getPhonePeBaseUrl()}/v1/oauth/token`,
  ).replace(/\/$/, "");
}

function hasRequiredPhonePeEnv() {
  return (
    process.env.PHONEPE_CLIENT_ID &&
    process.env.PHONEPE_CLIENT_SECRET &&
    process.env.PHONEPE_CLIENT_VERSION
  );
}

function buildMerchantOrderId(orderId) {
  const safeOrderId = String(orderId || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(-20);

  return `SV_${safeOrderId}_${Date.now()}`.slice(0, 63);
}

function normalizePhoneNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!digits) {
    return undefined;
  }

  if (digits.length === 10) {
    return digits;
  }

  return digits.slice(-10);
}

async function getPhonePeAccessToken() {
  const now = Date.now();

  if (
    phonePeAuthTokenCache.accessToken &&
    phonePeAuthTokenCache.expiresAtEpochMs - now > 60 * 1000
  ) {
    return phonePeAuthTokenCache.accessToken;
  }

  const response = await axios.post(
    getPhonePeTokenUrl(),
    new URLSearchParams({
      client_id: process.env.PHONEPE_CLIENT_ID,
      client_version: process.env.PHONEPE_CLIENT_VERSION,
      client_secret: process.env.PHONEPE_CLIENT_SECRET,
      grant_type: "client_credentials",
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  const accessToken = response?.data?.access_token;
  const expiresAtSeconds = Number(response?.data?.expires_at || 0);

  if (!accessToken) {
    throw new Error("PhonePe access token was not returned");
  }

  phonePeAuthTokenCache = {
    accessToken,
    expiresAtEpochMs:
      expiresAtSeconds > 0 ? expiresAtSeconds * 1000 : now + 10 * 60 * 1000,
  };

  return accessToken;
}

async function createPhonePePayment(payload) {
  const accessToken = await getPhonePeAccessToken();

  return axios.post(`${getPhonePeBaseUrl()}/checkout/v2/pay`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `O-Bearer ${accessToken}`,
    },
  });
}

async function getPhonePeOrderStatus(merchantOrderId) {
  const accessToken = await getPhonePeAccessToken();

  return axios.get(
    `${getPhonePeBaseUrl()}/checkout/v2/order/${merchantOrderId}/status`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
      params: {
        details: false,
        errorContext: true,
      },
    },
  );
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

    if (!hasRequiredPhonePeEnv()) {
      return res.status(500).json({
        success: false,
        message: "PhonePe v2 env vars are missing",
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

    const amountInPaise = Math.round(Number(dbOrder.totalAmount) * 100);

    if (!amountInPaise || amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    const merchantOrderId =
      dbOrder.merchantTransactionId || buildMerchantOrderId(dbOrder._id);

    dbOrder.merchantTransactionId = merchantOrderId;
    dbOrder.paymentMethod = "ONLINE";
    await dbOrder.save();

    const frontendUrl = (
      process.env.FRONTEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");

    const redirectUrlBase = `${frontendUrl}/payment-success?orderId=${dbOrder._id}&merchantTransactionId=${merchantOrderId}`;
    const paymentPayload = {
      merchantOrderId,
      amount: amountInPaise,
      expireAfter: 1200,
      metaInfo: {
        udf1: String(dbOrder._id),
      },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: `Payment for order ${dbOrder._id}`,
        merchantUrls: {
          redirectUrl: redirectUrlBase,
        },
      },
      ...(normalizePhoneNumber(dbOrder?.shippingAddress?.phone)
        ? {
            prefillUserLoginDetails: {
              phoneNumber: normalizePhoneNumber(dbOrder.shippingAddress.phone),
            },
          }
        : {}),
    };

    const response = await createPhonePePayment(paymentPayload);
    const redirectUrl = response?.data?.redirectUrl || null;

    if (!redirectUrl) {
      return res.status(400).json({
        success: false,
        message: "PhonePe did not return redirect url",
        code: "PHONEPE_REDIRECT_MISSING",
      });
    }

    res.json({
      success: true,
      data: {
        orderId: String(dbOrder._id),
        merchantTransactionId: merchantOrderId,
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
        error?.response?.status === 401
          ? "PhonePe authorization failed. Check PHONEPE_CLIENT_ID, PHONEPE_CLIENT_VERSION and PHONEPE_CLIENT_SECRET in deployed env."
          : error?.response?.status === 404
            ? "PhonePe endpoint not found. Check PHONEPE_BASE_URL and PHONEPE_AUTH_URL in deployed env."
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

    if (!hasRequiredPhonePeEnv()) {
      return res.status(500).json({
        success: false,
        message: "PhonePe v2 env vars are missing",
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

    const response = await getPhonePeOrderStatus(merchantTransactionId);
    const statusData = response?.data || {};
    const txnState = statusData?.state || null;
    const isPaid = txnState === "COMPLETED";
    const isFailed = txnState === "FAILED";

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

    if (isFailed && dbOrder.paymentStatus !== "PAID") {
      dbOrder.paymentStatus = "FAILED";
      await dbOrder.save();
    }

    return res.status(isFailed ? 400 : 202).json({
      success: false,
      message: isFailed ? "Payment failed" : "Payment is still pending",
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

router.post("/callback", async (_req, res) => {
  return res.status(200).send("OK");
});

module.exports = router;
