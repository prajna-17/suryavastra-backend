const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const Order = require("../models/order.model");
const { requireAuth } = require("../middlewares/auth.middleware");

let phonePeAuthTokenCache = {
  accessToken: null,
  expiresAtEpochMs: 0,
};

function getBaseCandidates(rawBaseUrl) {
  const base = String(rawBaseUrl || "").replace(/\/$/, "");
  const candidates = [base];

  if (base.includes("/apis/hermes")) {
    candidates.push(base.replace("/apis/hermes", "/apis"));
    candidates.push(base.replace("/apis/hermes", "/apis/pg"));
  }

  if (base.includes("/apis/pg")) {
    candidates.push(base.replace("/apis/pg", "/apis"));
    candidates.push(base.replace("/apis/pg", "/apis/hermes"));
  }

  if (base.includes("/apis")) {
    const origin = base.replace(/\/apis(?:\/.*)?$/, "");
    if (origin && origin !== base) {
      candidates.push(`${origin}/apis`);
      candidates.push(`${origin}/apis/pg`);
      candidates.push(`${origin}/apis/hermes`);
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

function getPhonePeMode() {
  if (
    process.env.PHONEPE_CLIENT_ID &&
    process.env.PHONEPE_CLIENT_SECRET &&
    process.env.PHONEPE_CLIENT_VERSION
  ) {
    return "STANDARD_CHECKOUT_V2";
  }

  return "LEGACY";
}

function getPhonePeBaseUrl() {
  const rawBaseUrl = String(process.env.PHONEPE_BASE_URL || "").trim();

  if (rawBaseUrl) {
    return rawBaseUrl.replace(/\/$/, "");
  }

  if (getPhonePeMode() === "STANDARD_CHECKOUT_V2") {
    return "https://api.phonepe.com/apis/pg";
  }

  return "https://api.phonepe.com/apis/hermes";
}

function getPhonePeLegacyEnvValidation() {
  return (
    process.env.PHONEPE_MERCHANT_ID &&
    process.env.PHONEPE_SALT_KEY &&
    process.env.PHONEPE_SALT_INDEX
  );
}

function getPhonePeV2EnvValidation() {
  return (
    process.env.PHONEPE_CLIENT_ID &&
    process.env.PHONEPE_CLIENT_SECRET &&
    process.env.PHONEPE_CLIENT_VERSION
  );
}

function buildMerchantTransactionId(orderId) {
  const safeOrderId = String(orderId || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(-12);

  return `TXN_${safeOrderId}_${Date.now()}`.slice(0, 63);
}

function shouldRetryPhonePeRequest(error) {
  const status = error?.response?.status;
  const providerCode = String(error?.response?.data?.code || "");
  const providerMessage = String(
    error?.response?.data?.message || "",
  ).toLowerCase();

  if (status === 404) {
    return true;
  }

  if (providerMessage.includes("api mapping not found")) {
    return true;
  }

  if (providerCode === "404") {
    return true;
  }

  return false;
}

async function getPhonePeAccessToken() {
  const now = Date.now();

  if (
    phonePeAuthTokenCache.accessToken &&
    phonePeAuthTokenCache.expiresAtEpochMs - now > 60 * 1000
  ) {
    return phonePeAuthTokenCache.accessToken;
  }

  const tokenUrl =
    process.env.PHONEPE_AUTH_URL ||
    "https://api.phonepe.com/apis/identity-manager/v1/oauth/token";

  const params = new URLSearchParams({
    client_id: process.env.PHONEPE_CLIENT_ID,
    client_version: process.env.PHONEPE_CLIENT_VERSION,
    client_secret: process.env.PHONEPE_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const response = await axios.post(tokenUrl, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

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

async function postPayWithFallback(baseUrl, payloadBase64, saltKey, saltIndex) {
  const candidates = getBaseCandidates(baseUrl);
  const payPaths = ["/pg/v1/pay", "/v1/pay"];
  let lastError;

  for (const candidate of candidates) {
    for (const payPath of payPaths) {
      const stringToSign = `${payloadBase64}${payPath}${saltKey}`;
      const checksum =
        crypto.createHash("sha256").update(stringToSign).digest("hex") +
        "###" +
        saltIndex;

      try {
        return await axios.post(
          `${candidate}${payPath}`,
          { request: payloadBase64 },
          {
            headers: {
              "Content-Type": "application/json",
              "X-VERIFY": checksum,
            },
          },
        );
      } catch (error) {
        lastError = error;
        if (!shouldRetryPhonePeRequest(error)) {
          throw error;
        }
      }
    }
  }

  throw lastError;
}

async function createStandardCheckoutPayment(payload) {
  const baseUrl = getPhonePeBaseUrl();
  const accessToken = await getPhonePeAccessToken();
  const endpoint = `${baseUrl}/checkout/v2/pay`;

  return axios.post(endpoint, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `O-Bearer ${accessToken}`,
    },
  });
}

async function getStatusWithFallback(
  baseUrl,
  merchantId,
  merchantTransactionId,
  saltKey,
  saltIndex,
) {
  const candidates = getBaseCandidates(baseUrl);
  const statusPrefixes = ["/pg/v1/status", "/v1/status"];
  let lastError;

  for (const candidate of candidates) {
    for (const statusPrefix of statusPrefixes) {
      const statusPath = `${statusPrefix}/${merchantId}/${merchantTransactionId}`;
      const stringToSign = `${statusPath}${saltKey}`;
      const checksum =
        crypto.createHash("sha256").update(stringToSign).digest("hex") +
        "###" +
        saltIndex;

      try {
        return await axios.get(`${candidate}${statusPath}`, {
          headers: {
            "Content-Type": "application/json",
            "X-VERIFY": checksum,
            "X-MERCHANT-ID": merchantId,
          },
        });
      } catch (error) {
        lastError = error;
        if (!shouldRetryPhonePeRequest(error)) {
          throw error;
        }
      }
    }
  }

  throw lastError;
}

async function getStandardCheckoutStatus(merchantOrderId) {
  const baseUrl = getPhonePeBaseUrl();
  const accessToken = await getPhonePeAccessToken();
  const endpoint = `${baseUrl}/checkout/v2/order/${merchantOrderId}/status`;

  return axios.get(endpoint, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `O-Bearer ${accessToken}`,
    },
    params: {
      details: false,
      errorContext: true,
    },
  });
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

    const phonePeMode = getPhonePeMode();

    if (
      (phonePeMode === "STANDARD_CHECKOUT_V2" &&
        !getPhonePeV2EnvValidation()) ||
      (phonePeMode === "LEGACY" && !getPhonePeLegacyEnvValidation())
    ) {
      return res.status(500).json({
        success: false,
        message:
          phonePeMode === "STANDARD_CHECKOUT_V2"
            ? "PhonePe v2 env vars are missing"
            : "PhonePe legacy env vars are missing",
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
      dbOrder.merchantTransactionId || buildMerchantTransactionId(dbOrder._id);

    dbOrder.merchantTransactionId = merchantTransactionId;
    dbOrder.paymentMethod = "ONLINE";
    await dbOrder.save();

    const frontendUrl = (
      process.env.FRONTEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");

    const redirectUrlBase = `${frontendUrl}/payment-success?orderId=${dbOrder._id}&merchantTransactionId=${merchantTransactionId}`;
    let redirectUrl = null;

    if (phonePeMode === "STANDARD_CHECKOUT_V2") {
      const v2Payload = {
        merchantOrderId: merchantTransactionId,
        amount: amountInPaise,
        expireAfter: 1200,
        paymentFlow: {
          type: "PG_CHECKOUT",
          message: `Payment for order ${dbOrder._id}`,
          merchantUrls: {
            redirectUrl: redirectUrlBase,
          },
        },
        ...(dbOrder?.shippingAddress?.phone
          ? {
              prefillUserLoginDetails: {
                phoneNumber: dbOrder.shippingAddress.phone,
              },
            }
          : {}),
      };

      const response = await createStandardCheckoutPayment(v2Payload);
      redirectUrl = response?.data?.redirectUrl || null;
    } else {
      const legacyPayload = {
        merchantId: process.env.PHONEPE_MERCHANT_ID,
        merchantTransactionId,
        merchantUserId: String(dbOrder.user),
        amount: amountInPaise,
        redirectUrl: redirectUrlBase,
        redirectMode: "REDIRECT",
        callbackUrl: process.env.PHONEPE_CALLBACK_URL,
        ...(dbOrder?.shippingAddress?.phone
          ? { mobileNumber: dbOrder.shippingAddress.phone }
          : {}),
        paymentInstrument: {
          type: "PAY_PAGE",
        },
      };

      const payloadBase64 = Buffer.from(JSON.stringify(legacyPayload)).toString(
        "base64",
      );

      const response = await postPayWithFallback(
        getPhonePeBaseUrl(),
        payloadBase64,
        process.env.PHONEPE_SALT_KEY,
        process.env.PHONEPE_SALT_INDEX,
      );

      redirectUrl =
        response?.data?.data?.instrumentResponse?.redirectInfo?.url || null;
    }

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
        providerError?.code === "404" ||
        String(providerError?.message || "").includes("Api Mapping Not Found")
          ? "PhonePe endpoint mapping looks wrong for the current merchant mode. Check deployed PHONEPE_BASE_URL and merchant onboarding mode."
          : providerError?.code === "AUTHORIZATION_FAILED" ||
              error?.response?.status === 401
            ? "PhonePe authorization failed. Verify whether this merchant should use legacy salt credentials or v2 client credentials."
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

    const phonePeMode = getPhonePeMode();
    let statusData = {};
    let txnState = null;
    let isPaid = false;
    let isFailed = false;

    if (phonePeMode === "STANDARD_CHECKOUT_V2") {
      const response = await getStandardCheckoutStatus(merchantTransactionId);
      statusData = response?.data || {};
      txnState = statusData?.state || null;
      isPaid = txnState === "COMPLETED";
      isFailed = txnState === "FAILED";
    } else {
      const response = await getStatusWithFallback(
        getPhonePeBaseUrl(),
        process.env.PHONEPE_MERCHANT_ID,
        merchantTransactionId,
        process.env.PHONEPE_SALT_KEY,
        process.env.PHONEPE_SALT_INDEX,
      );

      statusData = response?.data || {};
      txnState = statusData?.data?.state;
      isPaid =
        statusData?.success === true &&
        (txnState === "COMPLETED" || statusData?.code === "PAYMENT_SUCCESS");
      isFailed = txnState === "FAILED";
    }

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
