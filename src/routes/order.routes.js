const express = require("express");
const { requireAuth, requireAdmin } = require("../middlewares/auth.middleware");

const {
  createOrder,
  createPendingOrder,
  createCODOrder,
  fetchAllOrders,
  fetchOrderDetails,
  fetchUserAllOrders,
  orderCompleted,
  cancelOrder,
} = require("../controllers/order.controller");

const router = express.Router();

// CUSTOMER
router.post("/", requireAuth, createOrder);
router.post("/create-pending", requireAuth, createPendingOrder);
router.post("/create-cod", requireAuth, createCODOrder);

// ✅ specific routes
router.patch("/cancel/:orderId", requireAuth, cancelOrder);
router.get("/order-details/:orderId", requireAuth, fetchOrderDetails);

// ⚠️ keep this LAST
router.get("/:userId", requireAuth, fetchUserAllOrders);

// ADMIN
router.get("/", requireAuth, requireAdmin, fetchAllOrders);
router.patch("/:orderId", requireAuth, requireAdmin, orderCompleted);

// BOTH (logged-in)

module.exports = router;
