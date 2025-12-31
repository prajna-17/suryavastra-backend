const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    images: [String],
    videos: [String],
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },

    title: { type: String, required: true },

    description: { type: String, required: true },

    images: { type: [String], required: true },

    oldPrice: Number,
    price: { type: Number, required: true },

    quantity: { type: Number, default: 1 },

    sizes: {
      type: [String],
      enum: [],
      required: true,
    },

    colors: { type: [String], required: true },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    productSellingCategory: {
      type: String,
      enum: ["top-rating", "best-selling", "on-selling", "featured"],
      default: "featured",
    },

    inStock: { type: Boolean, default: true },

    OnSale: { type: Boolean, default: false },

    rating: { type: Number, min: 0, max: 5, default: 0 },

    reviews: [reviewSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
