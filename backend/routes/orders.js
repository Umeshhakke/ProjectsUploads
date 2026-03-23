const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');
const jwt = require('jsonwebtoken');
const crypto = require("crypto");


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
router.post('/create-order', authenticateToken, async (req, res) => {
  const user_id = req.user.id;

  db.all(`
    SELECT projects.price 
    FROM cart 
    JOIN projects ON cart.project_id = projects.id 
    WHERE cart.user_id = ?
  `, [user_id], async (err, items) => {

    if (err) return res.status(500).json({ message: "DB error" });
    if (!items.length) return res.status(400).json({ message: "Cart empty" });

    const total = items.reduce((sum, i) => sum + i.price, 0);

    if  (!total || total < 1) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    try {
      const razorpay = req.app.locals.razorpay;

      const order = await razorpay.orders.create({
        amount: total * 100,
        currency: "INR",
        receipt: "receipt_" + Date.now(),
        notes: {
          user_id: user_id
        }
      });

      res.json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency
      });

    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Order creation failed" });
    }
    if (err) {
      return res.status(500).json({ message: "DB error" });
    }
  });
});
// ===== WEBHOOK / CHECKOUT =====
router.post('/webhook', express.json({ type: 'application/json' }), (req, res) => {
  const { payload } = req.body;
  const paymentId = payload.payment.entity.id;
  const orderId = payload.payment.entity.order_id;
  const userId = payload.payment.entity.notes.user_id; // if you added notes

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

router.post('/verify-payment', authenticateToken, (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  } = req.body;

  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (generated_signature !== razorpay_signature) {
    return res.status(400).json({ message: "Payment verification failed" });
  }

  const user_id = req.user.id;

  db.all(`SELECT project_id FROM cart WHERE user_id = ?`, [user_id], (err, items) => {

    const stmt = db.prepare(`
      INSERT INTO orders (user_id, project_id, status)
      VALUES (?, ?, 'completed')
    `);

    items.forEach(item => stmt.run(user_id, item.project_id));
    stmt.finalize();

    db.run(`DELETE FROM cart WHERE user_id = ?`, [user_id]);

    res.json({ message: "Payment successful" });
  });
});
router.get('/my-orders', authenticateToken, (req, res) => {
  const user_id = req.user.id;

  db.all(`
    SELECT o.*, p.name, p.price, p.image_url
    FROM orders o
    JOIN projects p ON o.project_id = p.id
    WHERE o.user_id = ?
  `, [user_id], (err, rows) => {

    if (err) {
      console.log("Orders fetch error:", err);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }

    res.json(rows);
  });
});
module.exports = router;
