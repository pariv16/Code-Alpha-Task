const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'buzzly.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, bio TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY(user_id, post_id));
CREATE TABLE IF NOT EXISTS follows(follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(follower_id, following_id));
`);

app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'change-me-in-production', resave: false, saveUninitialized: false, cookie: { httpOnly: true, maxAge: 7 * 864e5 } }));
app.use(express.static(path.join(__dirname, 'public')));

const auth = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: 'Please log in' });
const clean = (s, max) => String(s || '').trim().slice(0, max);

const POST_SQL = `SELECT p.id, p.content, p.created_at, u.username, u.name,
  (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments,
  EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = @me) AS liked
  FROM posts p JOIN users u ON u.id = p.user_id`;

// ---- Auth ----
app.post('/api/register', (req, res) => {
  const username = clean(req.body.username, 20).toLowerCase(), name = clean(req.body.name, 40), password = req.body.password || '';
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username: 3-20 letters, numbers or underscores' });
  if (!name || password.length < 6) return res.status(400).json({ error: 'Name and a password of 6+ characters are required' });
  try {
    const r = db.prepare('INSERT INTO users(username,name,password) VALUES(?,?,?)').run(username, name, bcrypt.hashSync(password, 10));
    req.session.userId = r.lastInsertRowid;
    res.json({ id: r.lastInsertRowid, username, name });
  } catch { res.status(409).json({ error: 'Username already taken' }); }
});
app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(clean(req.body.username, 20).toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password)) return res.status(401).json({ error: 'Invalid username or password' });
  req.session.userId = u.id;
  res.json({ id: u.id, username: u.username, name: u.name });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json(req.session.userId ? db.prepare('SELECT id,username,name,bio FROM users WHERE id = ?').get(req.session.userId) : null));
app.put('/api/me', auth, (req, res) => {
  const name = clean(req.body.name, 40);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  db.prepare('UPDATE users SET name = ?, bio = ? WHERE id = ?').run(name, clean(req.body.bio, 160), req.session.userId);
  res.json({ ok: true });
});

// ---- Users / follow ----
app.get('/api/users', (req, res) => {
  const q = `%${clean(req.query.q, 30)}%`;
  res.json(db.prepare(`SELECT username, name, bio, (SELECT COUNT(*) FROM follows WHERE following_id = users.id) AS followers
    FROM users WHERE username LIKE ? OR name LIKE ? ORDER BY followers DESC LIMIT 30`).all(q, q));
});
app.get('/api/users/:username', (req, res) => {
  const me = req.session.userId || 0;
  const u = db.prepare(`SELECT id, username, name, bio, created_at,
    (SELECT COUNT(*) FROM follows WHERE following_id = users.id) AS followers,
    (SELECT COUNT(*) FROM follows WHERE follower_id = users.id) AS following,
    (SELECT COUNT(*) FROM posts WHERE user_id = users.id) AS posts,
    EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = users.id) AS isFollowing
    FROM users WHERE username = ?`).get(me, req.params.username.toLowerCase());
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.posts_list = db.prepare(POST_SQL + ' WHERE p.user_id = @uid ORDER BY p.id DESC').all({ me, uid: u.id });
  res.json(u);
});
app.post('/api/users/:username/follow', auth, (req, res) => {
  const t = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!t) return res.status(404).json({ error: 'User not found' });
  if (t.id === req.session.userId) return res.status(400).json({ error: "You can't follow yourself" });
  const del = db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.session.userId, t.id);
  if (!del.changes) db.prepare('INSERT INTO follows VALUES(?,?)').run(req.session.userId, t.id);
  res.json({ following: !del.changes });
});

// ---- Posts / comments / likes ----
app.get('/api/posts', (req, res) => {
  const me = req.session.userId || 0;
  const feed = req.query.feed === 'following' && me
    ? db.prepare(POST_SQL + ' WHERE p.user_id = @me OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = @me) ORDER BY p.id DESC LIMIT 100').all({ me })
    : db.prepare(POST_SQL + ' ORDER BY p.id DESC LIMIT 100').all({ me });
  res.json(feed);
});
app.post('/api/posts', auth, (req, res) => {
  const content = clean(req.body.content, 280);
  if (!content) return res.status(400).json({ error: 'Post cannot be empty' });
  res.json({ id: db.prepare('INSERT INTO posts(user_id,content) VALUES(?,?)').run(req.session.userId, content).lastInsertRowid });
});
app.get('/api/posts/:id', (req, res) => {
  const p = db.prepare(POST_SQL + ' WHERE p.id = @id').get({ me: req.session.userId || 0, id: req.params.id });
  if (!p) return res.status(404).json({ error: 'Post not found' });
  p.comments_list = db.prepare('SELECT c.id, c.content, c.created_at, u.username, u.name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id').all(req.params.id);
  res.json(p);
});
app.delete('/api/posts/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  r.changes ? res.json({ ok: true }) : res.status(403).json({ error: 'Not allowed' });
});
app.post('/api/posts/:id/comments', auth, (req, res) => {
  const content = clean(req.body.content, 200);
  if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  db.prepare('INSERT INTO comments(post_id,user_id,content) VALUES(?,?,?)').run(req.params.id, req.session.userId, content);
  res.json({ ok: true });
});
app.post('/api/posts/:id/like', auth, (req, res) => {
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  const del = db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.session.userId, req.params.id);
  if (!del.changes) db.prepare('INSERT INTO likes VALUES(?,?)').run(req.session.userId, req.params.id);
  res.json({ liked: !del.changes, likes: db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id = ?').get(req.params.id).c });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Buzzly running at http://localhost:${PORT}`));
