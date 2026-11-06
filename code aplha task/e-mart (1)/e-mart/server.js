const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'emart.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT, description TEXT, price REAL, image TEXT, category TEXT, stock INTEGER);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, user_id INTEGER, total REAL, address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER, product_id INTEGER, name TEXT, price REAL, qty INTEGER);
`);

// Seed sample products on first run
if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const ins = db.prepare('INSERT INTO products(name,description,price,image,category,stock) VALUES(?,?,?,?,?,?)');
  [
    ['Wireless Headphones', 'Over-ear Bluetooth headphones with 30-hour battery life and deep bass.', 2499, '🎧', 'Electronics', 25],
    ['Smart Watch', 'Fitness tracking, heart-rate monitor, and notifications on your wrist.', 3999, '⌚', 'Electronics', 15],
    ['Running Shoes', 'Lightweight, breathable shoes built for daily runs.', 2999, '👟', 'Fashion', 40],
    ['Backpack', 'Water-resistant 25L backpack with laptop compartment.', 1499, '🎒', 'Fashion', 30],
    ['Coffee Mug', 'Ceramic 350ml mug, microwave and dishwasher safe.', 299, '☕', 'Home', 100],
    ['Desk Lamp', 'LED lamp with adjustable brightness and warm/cool modes.', 899, '💡', 'Home', 50],
    ['Novel: The Long Road', 'A gripping bestselling paperback adventure.', 399, '📚', 'Books', 60],
    ['Sunglasses', 'UV-protected polarized sunglasses with a classic frame.', 1199, '🕶️', 'Fashion', 35],
  ].forEach(p => ins.run(...p));
}

app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'change-me-in-production', resave: false, saveUninitialized: false, cookie: { httpOnly: true, maxAge: 7 * 864e5 } }));
app.use(express.static(path.join(__dirname, 'public')));

const requireAuth = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: 'Please log in' });

// ---- Products ----
app.get('/api/products', (req, res) => {
  const { q = '', category = '' } = req.query;
  res.json(db.prepare('SELECT * FROM products WHERE (name LIKE ? OR description LIKE ?) AND (? = \'\' OR category = ?)').all(`%${q}%`, `%${q}%`, category, category));
});
app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
});

// ---- Auth ----
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required' });
  try {
    const r = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10));
    req.session.userId = r.lastInsertRowid;
    res.json({ id: r.lastInsertRowid, name });
  } catch { res.status(409).json({ error: 'Email already registered' }); }
});
app.post('/api/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Invalid email or password' });
  req.session.userId = u.id;
  res.json({ id: u.id, name: u.name });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => {
  const u = req.session.userId && db.prepare('SELECT id,name,email FROM users WHERE id = ?').get(req.session.userId);
  res.json(u || null);
});

// ---- Orders ----
app.post('/api/orders', requireAuth, (req, res) => {
  const { items, address } = req.body || {};
  if (!Array.isArray(items) || !items.length || !address) return res.status(400).json({ error: 'Cart and address are required' });
  try {
    const orderId = db.transaction(() => {
      let total = 0; const lines = [];
      for (const it of items) {
        const p = db.prepare('SELECT * FROM products WHERE id = ?').get(it.id);
        const qty = parseInt(it.qty, 10);
        if (!p || !(qty > 0)) throw new Error('Invalid item in cart');
        if (p.stock < qty) throw new Error(`Only ${p.stock} left of ${p.name}`);
        total += p.price * qty; lines.push({ p, qty });
      }
      const o = db.prepare('INSERT INTO orders(user_id,total,address) VALUES(?,?,?)').run(req.session.userId, total, address);
      for (const { p, qty } of lines) {
        db.prepare('INSERT INTO order_items(order_id,product_id,name,price,qty) VALUES(?,?,?,?,?)').run(o.lastInsertRowid, p.id, p.name, p.price, qty);
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, p.id);
      }
      return o.lastInsertRowid;
    })();
    res.json({ orderId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/orders', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.session.userId);
  orders.forEach(o => o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id));
  res.json(orders);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`E-Mart running at http://localhost:${PORT}`));
