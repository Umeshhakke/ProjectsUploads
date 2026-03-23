const express = require('express');
const router = express.Router();
const db = require('../config/db'); // ✅ SINGLE DB CONNECTION
const jwt = require('jsonwebtoken');


// ================= AUTH MIDDLEWARE =================
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


// ================= CART =================

// ➤ Add to cart
router.post('/cart/add', authenticateToken, (req, res) => {
  const { project_id } = req.body;
  const user_id = req.user.id;

  const query = `INSERT INTO cart (user_id, project_id) VALUES (?, ?)`;

  db.run(query, [user_id, project_id], function (err) {
    if (err) {
      console.log("ADD CART ERROR:", err);
      return res.status(400).json({ message: 'Error adding to cart' });
    }

    res.json({ message: 'Added to cart', cartId: this.lastID });
  });
});


// ➤ Get cart
router.get('/cart', authenticateToken, (req, res) => {
  const query = `
    SELECT cart.id AS cart_id, projects.name, projects.price, projects.description
    FROM cart
    JOIN projects ON cart.project_id = projects.id
    WHERE cart.user_id = ?
  `;

  db.all(query, [req.user.id], (err, rows) => {
    if (err) {
      console.log("FETCH CART ERROR:", err);
      return res.status(400).json({ message: 'Error fetching cart' });
    }

    res.json(rows);
  });
});


// ================= CREATE ORDER (RAZORPAY) =================

router.post('/create-order', authenticateToken, (req, res) => {
  console.log("👉 /create-order API hit");

  const user_id = req.user.id;

  const query = `
    SELECT projects.price 
    FROM cart 
    JOIN projects ON cart.project_id = projects.id 
    WHERE cart.user_id = ?
  `;

  db.all(query, [user_id], async (err, items) => {
    if (err) {
      console.log("DB ERROR:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!items.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    try {
      // ✅ Calculate total
      const total = items.reduce((sum, i) => sum + i.price, 0);

      console.log("💰 TOTAL:", total);

      // ✅ Get Razorpay instance
      const razorpay = req.app.locals.razorpay;

      if (!razorpay) {
        console.log("❌ Razorpay not initialized");
        return res.status(500).json({ message: "Payment service not available" });
      }

      // ✅ Create order
      const order = await razorpay.orders.create({
        amount: Math.round(total * 100), // ₹ → paise
        currency: "INR",
        receipt: `receipt_${Date.now()}`
      });

      console.log("✅ ORDER CREATED:", order.id);

      res.json({ order, total });

    } catch (err) {
      console.log("🔥 RAZORPAY ERROR:", err);
      res.status(500).json({ message: "Order creation failed" });
    }
  });
});


// ================= CHECKOUT =================

router.post('/checkout', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const { payment_id } = req.body;

  if (!payment_id) {
    return res.status(400).json({ message: "Payment ID required" });
  }

  db.all(`
    SELECT cart.project_id, projects.file_url
    FROM cart
    JOIN projects ON cart.project_id = projects.id
    WHERE cart.user_id = ?
  `, [user_id], (err, cartItems) => {

    if (err) {
      console.log("CHECKOUT ERROR:", err);
      return res.status(500).json({ message: 'Database error' });
    }

    if (!cartItems.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const stmt = db.prepare(`
      INSERT INTO orders (user_id, project_id, payment_id, status, download_link)
      VALUES (?, ?, ?, 'completed', ?)
    `);

    cartItems.forEach(item => {
      stmt.run(user_id, item.project_id, payment_id, item.file_url);
    });

    stmt.finalize();

    // ✅ Clear cart
    db.run(`DELETE FROM cart WHERE user_id = ?`, [user_id]);

    res.json({ message: '✅ Payment successful, orders created!' });
  });
});


// ================= USER ORDERS =================

router.get('/my', authenticateToken, (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT orders.id, projects.name, projects.price,
           orders.download_link, orders.order_date, orders.status
    FROM orders
    JOIN projects ON orders.project_id = projects.id
    WHERE orders.user_id = ?
  `;

  db.all(query, [userId], (err, rows) => {
    if (err) {
      console.log("FETCH ORDERS ERROR:", err);
      return res.status(400).json({ message: 'Error fetching orders' });
    }

    res.json(rows);
  });
});


// ================= ADMIN ORDERS =================

router.get('/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const query = `
    SELECT orders.id,
           users.name AS student_name,
           users.email,
           projects.name AS project_name,
           projects.price,
           orders.download_link,
           orders.status,
           orders.order_date
    FROM orders
    JOIN users ON orders.user_id = users.id
    JOIN projects ON orders.project_id = projects.id
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.log("ADMIN ORDERS ERROR:", err);
      return res.status(400).json({ message: 'Error fetching all orders' });
    }

    res.json(rows);
  });
});


// ================= DOWNLOAD ACCESS =================

router.get('/download/:projectId/:userId', (req, res) => {
  const { projectId, userId } = req.params;

  const query = `
    SELECT projects.file_url 
    FROM orders
    JOIN projects ON orders.project_id = projects.id
    WHERE orders.user_id = ? 
    AND orders.project_id = ?
    AND orders.status = 'completed'
  `;

  db.get(query, [userId, projectId], (err, row) => {
    if (err) {
      console.log("DOWNLOAD ERROR:", err);
      return res.status(500).json({ message: 'Server error' });
    }

    if (!row) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    res.json({ file_url: row.file_url });
  });
});


module.exports = router;
