require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

let razorpayInstance = null;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  const Razorpay = require("razorpay");

  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}
app.locals.razorpay = razorpayInstance;

// Create SQLite Database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error('DB Connection Error:', err);
  else console.log('Connected to SQLite DB');
});

// Create Tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image_url TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    project_id INTEGER,
    status TEXT DEFAULT 'pending',
    order_date TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
  )`);
 db.run(`CREATE TABLE IF NOT EXISTS cart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    project_id INTEGER,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
  )`);

});

// Test Route
app.get('/', (req, res) => {
  res.send('SQLite Backend is working!');
});

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const projectRoutes = require('./routes/projects');
app.use('/api/projects', projectRoutes);

const orderRoutes = require('./routes/orders');
app.use('/api/orders', orderRoutes);

const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);

app.use('/files', express.static('files'));

const paymentRoutes = require('./routes/payment');
app.use('/api/payment', paymentRoutes);
// // Start Server

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
