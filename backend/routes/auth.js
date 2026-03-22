const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const sqlite3 = require('sqlite3').verbose();
const db = require('../config/db');
// const db = new sqlite3.Database('./database.db');

// Signup
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });

  const hashedPassword = await bcrypt.hash(password, 10);

  const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
  db.run(query, [name, email, hashedPassword], function(err) {
    if (err) return res.status(400).json({ message: 'Email already exists' });
    res.json({ message: 'Signup successful', userId: this.lastID });
  });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'All fields required' });

  const query = `SELECT * FROM users WHERE email = ?`;
  db.get(query, [email], async (err, user) => {
    if (err || !user) return res.status(400).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid password' });

    // Generate JWT
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });
});

router.get('/me/:id', (req, res) => {
  const userId = req.params.id;

  const query = 'SELECT id, name, email, role FROM users WHERE id = ?';

  db.get(query, [userId], (err, user) => {
    if (err) return res.status(500).json({ message: 'Error fetching user' });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  });
});

router.put('/update/:id', (req, res) => {
  const userId = req.params.id;
  const { name, email } = req.body;

  const query = `
    UPDATE users 
    SET name = ?, email = ? 
    WHERE id = ?
  `;

  db.run(query, [name, email, userId], function (err) {
    if (err) {
      return res.status(500).json({ message: 'Update failed' });
    }

    res.json({ message: 'Profile updated successfully' });
  });
});

module.exports = router;