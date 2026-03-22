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

// Add project (Admin only)
router.post('/add', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

  const { name, description, price, image_url } = req.body;
  if (!name || !price) return res.status(400).json({ message: 'Name and price required' });

  const query = `INSERT INTO projects (name, description, price, image_url) VALUES (?, ?, ?, ?)`;
  db.run(query, [name, description, price, image_url], function(err) {
    if (err) return res.status(400).json({ message: 'Error adding project' });
    res.json({ message: 'Project added', projectId: this.lastID });
  });
});

// Get all projects
router.get('/', (req, res) => {
  const query = `SELECT * FROM projects`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ message: 'Error fetching projects' });
    res.json(rows);
  });
});

// Get project by ID
router.get('/:id', (req, res) => {
  const query = `SELECT * FROM projects WHERE id = ?`;
  db.get(query, [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ message: 'Project not found' });
    res.json(row);
  });
});

module.exports = router;