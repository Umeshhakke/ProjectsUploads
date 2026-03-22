const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');
const jwt = require('jsonwebtoken');

// Middleware to check JWT
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

// ---------- CART ----------

// Add project to cart
router.post('/cart/add', authenticateToken, (req, res) => {
  const { project_id } = req.body;
  const user_id = req.user.id;
  const query = `INSERT INTO cart (user_id, project_id) VALUES (?, ?)`;
  db.run(query, [user_id, project_id], function(err) {
    if (err) return res.status(400).json({ message: 'Error adding to cart' });
    res.json({ message: 'Added to cart', cartId: this.lastID });
  });
});

// Get cart items
router.get('/cart', authenticateToken, (req, res) => {
  const query = `
    SELECT cart.id, projects.name, projects.price, projects.description
    FROM cart
    JOIN projects ON cart.project_id = projects.id
    WHERE cart.user_id = ?
  `;
  db.all(query, [req.user.id], (err, rows) => {
    if (err) return res.status(400).json({ message: 'Error fetching cart' });
    res.json(rows);
  });
});

// ---------- CHECKOUT ----------
// create order
router.post('/create-order', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
console.log("Razorpay:", req.app.locals.razorpay);
  db.all(`
    SELECT projects.price 
    FROM cart 
    JOIN projects ON cart.project_id = projects.id
    WHERE cart.user_id = ?
  `, [user_id], async (err, items) => {

    if (err || !items.length)
      return res.status(400).json({ message: 'Cart is empty' });

    const total = items.reduce((sum, item) => sum + item.price, 0);

    try {
      const order = await req.app.locals.razorpay.orders.create({
        amount: total * 100,
        currency: "INR"
      });

      res.json({ order, total });

    } catch (err) {
      console.log(err);
      res.status(500).send("Error creating Razorpay order");
    }
  });
});

// Checkout cart items
router.post('/checkout', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const { payment_id } = req.body;

  db.all(`
    SELECT cart.project_id, projects.file_url
    FROM cart
    JOIN projects ON cart.project_id = projects.id
    WHERE cart.user_id = ?
  `, [user_id], (err, cartItems) => {

    if (err || !cartItems.length)
      return res.status(400).json({ message: 'Cart is empty' });

    const stmt = db.prepare(`
      INSERT INTO orders (user_id, project_id, payment_id, status, download_link)
      VALUES (?, ?, ?, 'completed', ?)
    `);

    cartItems.forEach(item => {
      stmt.run(user_id, item.project_id, payment_id, item.file_url);
    });

    stmt.finalize();

    // Clear cart
    db.run(`DELETE FROM cart WHERE user_id = ?`, [user_id]);

    res.json({ message: 'Payment successful, orders created!' });
  });
});
// ---------- ORDERS ----------


// Get orders for logged-in student
router.get('/my', authenticateToken, (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT orders.id, projects.name, projects.price, orders.download_link, orders.order_date, orders.status
    FROM orders
    JOIN projects ON orders.project_id = projects.id
    WHERE orders.user_id = ?
  `;

  db.all(query, [userId], (err, rows) => {
    if (err) return res.status(400).json({ message: 'Error fetching orders' });
    res.json(rows);
  });
});

// Get all orders (Admin only)
router.get('/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

  const query = `
    SELECT orders.id, users.name AS student_name, users.email, projects.name AS project_name, projects.price, orders.download_link, orders.status, orders.order_date
    FROM orders
    JOIN users ON orders.user_id = users.id
    JOIN projects ON orders.project_id = projects.id
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ message: 'Error fetching all orders' });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { user_id, project_ids } = req.body;

  const stmt = db.prepare(`
    INSERT INTO orders (user_id, project_id, status)
    VALUES (?, ?, 'completed')
  `);

  project_ids.forEach((pid) => {
    stmt.run(user_id, pid);
  });

  stmt.finalize();

  res.json({ message: 'Order placed successfully' });
});

router.get('/:userId', (req, res) => {
  const userId = req.params.userId;

  const query = `
    SELECT orders.id AS order_id,
           projects.name,
           projects.price,
           projects.file_url
    FROM orders
    JOIN projects ON orders.project_id = projects.id
    WHERE orders.user_id = ?
  `;

  db.all(query, [userId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Error fetching orders' });

    res.json(rows);
  });
});

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
    if (err) return res.status(500).json({ message: 'Error' });

    if (!row) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    res.json({ file_url: row.file_url });
  });
});
module.exports = router;
