const express = require("express");
const { requireAuth, requireAdmin } = require("../middlewares/auth.middleware");

const {
  createOrder,
  createPendingOrder,
  fetchAllOrders,
  fetchOrderDetails,
  fetchUserAllOrders,
  orderCompleted,
} = require("../controllers/order.controller");

const router = express.Router();

// CUSTOMER
router.post("/", requireAuth, createOrder);
router.get("/:userId", requireAuth, fetchUserAllOrders);

router.post("/create-pending", requireAuth, createPendingOrder);

// ADMIN
router.get("/", requireAuth, requireAdmin, fetchAllOrders);
router.patch("/:orderId", requireAuth, requireAdmin, orderCompleted);

// BOTH (logged-in)
router.get("/order-details/:orderId", requireAuth, fetchOrderDetails);

module.exports = router;
