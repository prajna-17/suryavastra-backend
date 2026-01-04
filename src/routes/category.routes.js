const express = require("express");
const { requireAuth, requireAdmin } = require("../middlewares/auth.middleware");

const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
} = require("../controllers/category.controller");

const router = express.Router();

router.post("/", requireAuth, requireAdmin, createCategory);
router.put("/:id", requireAuth, requireAdmin, updateCategory);
router.delete("/:id", requireAuth, requireAdmin, deleteCategory);

router.get("/", getCategories); // public

module.exports = router;
