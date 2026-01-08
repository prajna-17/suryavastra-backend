const mongoose = require("mongoose");

const orderProductSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    title: String,
    images: [],
    category: String,
    price: Number,
    quantity: {
      type: Number,
    },
    subtotal: Number,
  },
  { _id: false }
);

const shippingSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    addressLine: {
      type: String,
      required: true,
    },
    landmark: String,
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    products: {
      type: [orderProductSchema],
      required: true,
    },

    shippingAddress: {
      type: shippingSchema,
      required: true,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    merchantTransactionId: {
      type: String,
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
    },

    isCompleted: {
      type: Boolean,
      default: false,
    },
    paymentMethod: {
      type: String,
      enum: ["ONLINE", "COD"],
      default: "ONLINE",
    },

    orderStatus: {
      type: String,
      enum: ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"],
      default: "PLACED",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
