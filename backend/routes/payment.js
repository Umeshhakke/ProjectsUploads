const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

router.post('/create-order', async (req, res) => {
  const { amount } = req.body;

  try {
    const order = await razorpay.orders.create({
      amount: amount, // ₹ → paise
      currency: 'INR',
      receipt: 'receipt_' + Date.now(),
    });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Payment error' });
  }
});

module.exports = router;