const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: String,
    rating: Number,
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

    // 🔥 MULTIPLE IMAGES
    images: { type: [String], required: true },

    // 🔥 COLOR-WISE IMAGES
    colorImages: [
      {
        color: { type: String, required: true },
        images: { type: [String], required: true },
      },
    ],

    oldPrice: Number,
    price: { type: Number, required: true },
    quantity: { type: Number, default: 1 },

    sizes: { type: [String], required: true },
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
    rating: { type: Number, default: 0 },
    reviews: [reviewSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
