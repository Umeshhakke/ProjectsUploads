const jwt = require('jsonwebtoken');
const db = require('../config/db');

module.exports = function (req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(403).json({ message: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    req.user = decoded;
    next();

  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};