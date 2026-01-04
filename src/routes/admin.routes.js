const express = require("express");
const { createAdmin } = require("../controllers/admin.controller");
const { requireAuth, requireAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

// Only ADMIN can create another ADMIN
router.post("/create", requireAuth, requireAdmin, createAdmin);

module.exports = router;
