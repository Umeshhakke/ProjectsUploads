const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// ===== CREATE ORDER =====
router.post('/create-order', authenticateToken, (req, res) => {
  const user_id = req.user.id;

  const query = `
    SELECT projects.price 
    FROM cart 
    JOIN projects ON cart.project_id = projects.id 
    WHERE cart.user_id = ?
  `;

  db.all(query, [user_id], async (err, items) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!items.length) return res.status(400).json({ message: "Cart empty" });

    const total = items.reduce((sum, i) => sum + i.price, 0);
    const razorpay = req.app.locals.razorpay;
    if (!razorpay) return res.status(500).json({ message: "Razorpay not initialized" });

    try {
      const order = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1
      });

      // 🔹 Generate hosted payment link for user
      const hostedLink = `https://checkout.razorpay.com/v1/checkout.js?order_id=${order.id}`;

      res.json({ order, total, hostedLink });

    } catch (error) {
      console.log("🔥 RAZORPAY ERROR:", error);
      res.status(500).json({ message: "Order creation failed", error: error.message });
    }
  });
});

// ===== WEBHOOK / CHECKOUT =====
router.post('/webhook', express.json({ type: 'application/json' }), (req, res) => {
  const { payload } = req.body;

  const paymentId = payload.payment.entity.id;
  const orderId = payload.payment.entity.order_id;
  const userId = payload.payment.entity.notes.user_id; // Optional if you sent notes

  // Mark all cart items as completed for this user
  db.all(`SELECT project_id FROM cart WHERE user_id = ?`, [userId], (err, items) => {
    if (err || !items.length) return res.status(400).json({ message: 'No cart items' });

    const stmt = db.prepare(`
      INSERT INTO orders (user_id, project_id, payment_id, status)
      VALUES (?, ?, ?, 'completed')
    `);

    items.forEach(item => stmt.run(userId, item.project_id, paymentId));
    stmt.finalize();

    db.run(`DELETE FROM cart WHERE user_id = ?`, [userId]);
    res.json({ message: 'Payment verified and orders created!' });
  });
});

module.exports = router;
