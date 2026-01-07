const Category = require("../models/category.model");

// CREATE CATEGORY
const createCategory = async (req, res) => {
  try {
    const { name, image } = req.body;
    if (!name || !image) {
      return res.status(400).json({
        message: "Name and image are required",
      });
    }

    const existing = await Category.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: "Category already exists" });
    }

    const category = await Category.create({
      name,
      image,
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.log(error.message);
  }
};

// GET ALL CATEGORIES
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.json({ data: categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE CATEGORY
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Category.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!updated)
      return res.status(404).json({ message: "Category not found" });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE CATEGORY
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Category.findByIdAndDelete(id);

    if (!deleted)
      return res.status(404).json({ message: "Category not found" });

    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
};
