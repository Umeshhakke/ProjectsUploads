const express = require('express');
const router = express.Router();
// const db = require('../index').db; // adjust if needed
const multer = require('multer');
const adminMiddleware = require('../middleware/admin');
const db = require('../config/db');


const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'image') cb(null, 'uploads/images');
    else if (file.fieldname === 'file') cb(null, 'uploads/files');
    else if (file.fieldname === 'report') cb(null, 'uploads/reports');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});


const upload = multer({ storage });

// ➤ ADD PROJECT
router.post(
  '/project',
  adminMiddleware,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'report', maxCount: 1 }
  ]),
  (req, res) => {
    const { name, description, price } = req.body;

    const image_url = req.files['image']
    ? `/uploads/images/${req.files['image'][0].filename}`
    : null;

    const file_url = req.files['file']
    ? `/uploads/files/${req.files['file'][0].filename}`
    : null;

    const report_url = req.files['report']
    ? `/uploads/reports/${req.files['report'][0].filename}`
    : null;

    const query = `
      INSERT INTO projects (name, description, price, image_url, file_url, report_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
      query,
      [name, description, price, image_url, file_url, report_url],
      function (err) {
        if (err) {
          console.log(err);
          return res.status(500).json({ message: 'Error adding project' });
        }

        res.json({ message: 'Project added successfully' });
      }
    );
  }
);

// ➤ DELETE PROJECT
router.delete('/project/:id', adminMiddleware, (req, res) => {
  db.run('DELETE FROM projects WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ message: 'Delete failed' });

    res.json({ message: 'Project deleted' });
  });
});
router.get('/users', adminMiddleware, (req, res) => {
  db.all('SELECT id, name, email, role FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Error fetching users' });
    res.json(rows);
  });
});
router.get('/projects', adminMiddleware, (req, res) => {
  db.all('SELECT * FROM projects', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Error fetching projects' });
    res.json(rows);
  });
});
router.get('/orders', adminMiddleware, (req, res) => {
  const query = `
    SELECT orders.id, users.name AS user_name, projects.name AS project_name, orders.status
    FROM orders
    JOIN users ON orders.user_id = users.id
    JOIN projects ON orders.project_id = projects.id
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Error fetching orders' });
    res.json(rows);
  });
});


router.delete('/user/:id', adminMiddleware, (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ message: 'Delete failed' });
    res.json({ message: 'User deleted' });
  });
});

router.put('/order/:id', adminMiddleware, (req, res) => {
  const { status } = req.body;

  db.run(
    'UPDATE orders SET status = ? WHERE id = ?',
    [status, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Update failed' });
      res.json({ message: 'Order updated' });
    }
  );
});

module.exports = router;