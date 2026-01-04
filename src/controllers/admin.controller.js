const User = require("../models/user.model");

const createAdmin = async (req, res) => {
  try {
    const { email } = req.body;

    // 1️⃣ Validate email
    if (!email) {
      return res.status(400).json({
        status: "error",
        message: "Email is required",
      });
    }

    // 2️⃣ Find existing user by email
    const user = await User.findOne({ email });

    // 3️⃣ User must exist (important production rule)
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found. Ask user to login once.",
      });
    }

    // 4️⃣ Already admin?
    if (user.role === "ADMIN") {
      return res.status(400).json({
        status: "error",
        message: "User is already an admin",
      });
    }

    // 5️⃣ Upgrade role
    user.role = "ADMIN";
    await user.save();

    return res.status(200).json({
      status: "success",
      message: "Admin created successfully",
      adminId: user._id,
    });
  } catch (error) {
    console.error("CREATE ADMIN ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

module.exports = { createAdmin };
