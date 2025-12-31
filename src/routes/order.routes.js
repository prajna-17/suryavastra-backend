const express = require("express");
const {
  createOrder,
  fetchAllOrders,
  fetchOrderDetails,
  fetchUserAllOrders,
  orderCompleted,
} = require("../controllers/order.controller");

const router = express.Router();

router.post("/", createOrder);
router.get("/", fetchAllOrders);
router.get("/:userId", fetchUserAllOrders);
router.get("/order-details/:orderId", fetchOrderDetails);
router.patch("/:orderId", orderCompleted);

module.exports = router;
