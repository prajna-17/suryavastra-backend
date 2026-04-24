const express = require("express");
const {
  register,
  login,
  sendOtp,
  verifyOtp,
  googleAuth,
  getCurrentUser,
} = require("../controllers/auth.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/google", googleAuth);
router.get("/me", requireAuth, getCurrentUser);
module.exports = router;
