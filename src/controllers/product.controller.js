const Product = require("../models/product.model");
const Category = require("../models/category.model");

// CREATE PRODUCT
const createProduct = async (req, res) => {
  try {
    const { category } = req.body;

    const categoryExist = await Category.findById(category);
    if (!categoryExist)
      return res.status(400).json({ message: "Invalid category" });

    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET ALL PRODUCTS
const getProducts = async (req, res) => {
  try {
    console.log("🔥 FILTER CATEGORY:", req.query.category);

    const { category } = req.query;

    const filter = category ? { category } : {};

    const products = await Product.find(filter).populate("category");
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET SINGLE PRODUCT
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE PRODUCT
const updateProduct = async (req, res) => {
  try {
    if (req.body.category) {
      const categoryExist = await Category.findById(req.body.category);
      if (!categoryExist)
        return res.status(400).json({ message: "Invalid category" });
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!updated) return res.status(404).json({ message: "Product not found" });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE PRODUCT
const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);

    if (!deleted) return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
