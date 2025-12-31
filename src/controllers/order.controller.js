const Order = require("../models/order.model");
const Product = require("../models/product.model");
const User = require("../models/user.model");
const { createResponse, ErrorResponse } = require("../utils/responseWrapper");

// CREATE ORDER
const createOrder = async (req, res) => {
  try {
    const { customerId, products, shippingAddress } = req.body;

    const customerExists = await User.findById(customerId);
    if (!customerExists) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    if (!products || products.length === 0) {
      return res.status(400).json({
        message: "Order must contain at least one product",
      });
    }

    let orderItems = [];
    let totalAmount = 0;

    for (const item of products) {
      const dbProduct = await Product.findById(item.product);

      if (!dbProduct) {
        return res.status(400).json({
          message: `Invalid product ID: ${item.product}`,
        });
      }

      if (!dbProduct.inStock) {
        return res.status(400).json({
          message: `${dbProduct.title} is currently unavailable`,
        });
      }

      const subtotal = dbProduct.price * item.quantity;
      totalAmount += subtotal;

      orderItems.push({
        product: dbProduct._id,
        title: dbProduct.title,
        images: dbProduct.images,
        category: dbProduct.category,
        price: dbProduct.price,
        quantity: item.quantity,
        subtotal,
      });
    }

    const newOrder = new Order({
      user: customerId,
      products: orderItems,
      shippingAddress,
      totalAmount,
    });

    await newOrder.save();

    const savedOrder = await Order.findById(newOrder._id).populate(
      "products.product",
      "title images"
    );

    res
      .status(201)
      .json(createResponse(201, savedOrder, "Order placed successfully"));
  } catch (error) {
    res.status(500).json(ErrorResponse(500, error.message));
  }
};

// FETCH ALL ORDERS (Admin)
const fetchAllOrders = async (req, res) => {
  try {
    const allOrders = await Order.find({});
    return res
      .status(200)
      .json(createResponse(200, allOrders, "All orders fetched"));
  } catch (error) {
    res.status(500).json(ErrorResponse(500, error.message));
  }
};

// FETCH ORDERS BY USER
const fetchUserAllOrders = async (req, res) => {
  try {
    const userId = req.params.userId;

    const userDetails = await User.findById(userId);

    if (!userDetails) {
      return res.status(400).json(ErrorResponse(400, "User is not valid"));
    }

    const allOrders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("products.product", "title images");

    return res
      .status(200)
      .json(createResponse(200, allOrders, "User orders fetched"));
  } catch (error) {
    res.status(500).json(ErrorResponse(500, error.message));
  }
};

// FETCH ORDER DETAILS
const fetchOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const orderDetails = await Order.findById(orderId);

    if (!orderDetails) {
      return res.status(400).json(ErrorResponse(400, "Order not valid"));
    }

    return res
      .status(200)
      .json(createResponse(200, orderDetails, "Order details fetched"));
  } catch (error) {
    res.status(500).json(ErrorResponse(500, error.message));
  }
};

// COMPLETE ORDER
const orderCompleted = async (req, res) => {
  try {
    const { orderId } = req.params;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { isCompleted: true },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(400).json(ErrorResponse(400, "Order not valid"));
    }

    return res
      .status(200)
      .json(createResponse(200, updatedOrder, "Order status updated"));
  } catch (error) {
    res.status(500).json(ErrorResponse(500, error.message));
  }
};

module.exports = {
  createOrder,
  fetchAllOrders,
  fetchOrderDetails,
  fetchUserAllOrders,
  orderCompleted,
};
