const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");

router.post("/initiate", async (req, res) => {
  try {
    const { amount, userId } = req.body;

    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX;

    const { merchantTransactionId } = req.body;

    const payload = {
      merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: userId || "USER123",
      amount: amount * 100, // in paise
      redirectUrl: "http://localhost:3000/payment-success",
      redirectMode: "POST",
      callbackUrl: process.env.PHONEPE_CALLBACK_URL,
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
      "base64"
    );

    const stringToSign = payloadBase64 + "/pg/v1/pay" + saltKey;

    const checksum =
      crypto.createHash("sha256").update(stringToSign).digest("hex") +
      "###" +
      saltIndex;

    const response = await axios.post(
      `${process.env.PHONEPE_BASE_URL}/pg/v1/pay`,
      {
        request: payloadBase64,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
        },
      }
    );

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Payment initiation failed",
    });
  }
});

router.post("/callback", async (req, res) => {
  try {
    const response = req.body;

    console.log("PhonePe Callback:", response);

    // PhonePe expects 200 OK
    res.status(200).send("OK");
  } catch (error) {
    console.error("Callback Error:", error);
    res.status(500).send("ERROR");
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { merchantTransactionId } = req.body;

    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX;

    const stringToSign =
      `/pg/v1/status/${merchantId}/${merchantTransactionId}` + saltKey;

    const checksum =
      crypto.createHash("sha256").update(stringToSign).digest("hex") +
      "###" +
      saltIndex;

    const response = await axios.get(
      `${process.env.PHONEPE_BASE_URL}/pg/v1/status/${merchantId}/${merchantTransactionId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": merchantId,
        },
      }
    );

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Verify Error:", error);
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
});

module.exports = router;
