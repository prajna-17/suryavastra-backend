const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const { createResponse, ErrorResponse } = require("../utils/responseWrapper");
const jwt = require("jsonwebtoken");
const sendOtpEmail = require("../utils/sendEmail");

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json(ErrorResponse(400, "User already exists"));

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({ name, email, password: hashed });

    return res
      .status(201)
      .json(createResponse(201, user, "User created successfully"));
  } catch (error) {
    return res.status(500).json(ErrorResponse(500, "Internal server error"));
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json(ErrorResponse(404, "User not found"));

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json(ErrorResponse(400, "Invalid credentials"));

    return res.status(200).json(createResponse(200, user, "Login successful"));
  } catch (error) {
    return res.status(500).json(ErrorResponse(500, "Internal server error"));
  }
};

const sendOtp = async (req, res) => {
  try {
    let { phone } = req.body; // phone = email now

    if (!phone) {
      return res.status(400).json(ErrorResponse(400, "Email is required"));
    }

    phone = phone.toLowerCase().trim();

    let user = await User.findOne({ phone });

    if (!user) {
      user = new User({ phone });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    if (user?.otpExpiry && user.otpExpiry > Date.now()) {
      return res.status(400).json({
        status: "error",
        message: "Please wait before resending OTP",
      });
    }

    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();
    await sendOtpEmail(phone, otp);

    return res
      .status(200)
      .json(createResponse(200, null, "OTP sent successfully"));
  } catch (error) {
    console.error("SEND OTP ERROR:", error);
    return res.status(500).json(ErrorResponse(500, "Internal server error"));
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        status: "error",
        message: "Phone and OTP are required",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        status: "error",
        message: "Invalid OTP",
      });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({
        status: "error",
        message: "OTP expired",
      });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      status: "success",
      message: "OTP verified successfully",
      token,
      role: user.role,
      isProfileComplete: !!user.name, // 👈 KEY LINE
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

module.exports = { register, login, sendOtp, verifyOtp };
