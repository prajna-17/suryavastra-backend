const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const { createResponse, ErrorResponse } = require("../utils/responseWrapper");

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

module.exports = { register, login };
