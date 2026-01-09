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

// CREATE PENDING ORDER (for ONLINE PAYMENT)
const createPendingOrder = async (req, res) => {
  console.log("REQ BODY 👉", req.body);
  console.log("AUTH USER 👉", req.user?._id);

  try {
    const { products, shippingAddress } = req.body;
    const customerId = req.user.userId;

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

    const merchantTransactionId = "TXN_" + Date.now();

    const newOrder = new Order({
      user: customerId,
      products: orderItems,
      shippingAddress,
      totalAmount,
      paymentStatus: "PENDING",
      isCompleted: false,
      merchantTransactionId,
    });

    await newOrder.save();

    res.status(201).json(
      createResponse(
        201,
        {
          orderId: newOrder._id,
          amount: totalAmount,
          merchantTransactionId,
        },
        "Pending order created"
      )
    );
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
// COMPLETE ORDER
const orderCompleted = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus } = req.body;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        orderStatus: orderStatus || "DELIVERED",
        isCompleted: orderStatus === "DELIVERED",
      },
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

// CREATE COD ORDER
const createCODOrder = async (req, res) => {
  try {
    const { products, shippingAddress } = req.body;
    const customerId = req.user.userId;

    if (!products || products.length === 0) {
      return res
        .status(400)
        .json(ErrorResponse(400, "Order must contain at least one product"));
    }

    let orderItems = [];
    let totalAmount = 0;

    for (const item of products) {
      const dbProduct = await Product.findById(item.product);

      if (!dbProduct) {
        return res
          .status(400)
          .json(ErrorResponse(400, `Invalid product ID: ${item.product}`));
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

      paymentMethod: "COD",
      paymentStatus: "PENDING",
      orderStatus: "PLACED",
      isCompleted: false,
    });

    await newOrder.save();

    return res
      .status(201)
      .json(createResponse(201, { orderId: newOrder._id }, "COD order placed"));
  } catch (error) {
    return res.status(500).json(ErrorResponse(500, error.message));
  }
};

// CANCEL ORDER (CUSTOMER)
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderStatus !== "PLACED") {
      return res.status(400).json({ message: "Order cannot be cancelled now" });
    }

    order.orderStatus = "CANCELLED";
    order.isCompleted = false;

    if (order.paymentMethod === "ONLINE") {
      order.paymentStatus = "FAILED";
    }

    await order.save();

    return res.status(200).json({
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOrder,
  createPendingOrder,
  fetchAllOrders,
  fetchOrderDetails,
  fetchUserAllOrders,
  orderCompleted,
  createCODOrder,
  cancelOrder,
};
