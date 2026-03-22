const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Add item to cart
router.post('/', (req, res) => {
  const { user_id, project_id } = req.body;
  // ⚡ Make sure NOT to overwrite existing rows
  const query = 'INSERT INTO cart (user_id, project_id) VALUES (?, ?)';
  db.run(query, [user_id, project_id], function (err) {
    if (err) return res.status(500).json({ message: 'Failed to add to cart' });
    res.json({ cart_id: this.lastID });
  });
});

router.get('/:user_id', (req, res) => {
  const user_id = req.params.user_id;
  const query = `
    SELECT c.id as cart_id, p.id as project_id, p.name, p.price, p.image_url
    FROM cart c
    JOIN projects p ON c.project_id = p.id
    WHERE c.user_id = ?
  `;
  db.all(query, [user_id], (err, rows) => {
    if (err) {
      console.log('Cart fetch error:', err);
      return res.status(500).json({ message: 'Failed to fetch cart' });
    }
    console.log('Cart rows for user', user_id, rows); // 🔹 ADD THIS LINE
    res.json(rows || []);
  });
});

// Remove item from cart
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM cart WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ message: 'Failed to remove item' });
    res.json({ message: 'Item removed' });
  });
});

module.exports = router;