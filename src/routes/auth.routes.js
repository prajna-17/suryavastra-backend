const express = require("express");
const {
  register,
  login,
  sendOtp,
  verifyOtp,
  googleAuth,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/google", googleAuth);
module.exports = router;
