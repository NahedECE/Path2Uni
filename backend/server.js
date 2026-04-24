const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'path2uni_super_secret_key_2026';

let db;

async function initDB() {
  db = await sqlite.open({
    filename: path.join(__dirname, 'path2uni.db'),
    driver: sqlite3.Database
  });

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      ssc_gpa REAL,
      hsc_gpa REAL,
      biology_gpa REAL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sessions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);

  // Applications table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      university_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notifications table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Circulars table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS circulars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      university TEXT NOT NULL,
      deadline TEXT,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Universities table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS universities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      min_ssc REAL,
      min_hsc REAL,
      exam_date TEXT
    )
  `);

  // Insert sample data
  const uniCount = await db.get('SELECT COUNT(*) as c FROM universities');
  if (uniCount.c === 0) {
    await db.run(`INSERT INTO universities (name, min_ssc, min_hsc, exam_date) VALUES 
      ('BUET', 3.5, 3.5, '2026-05-25'),
      ('DU (Ka Unit)', 3.5, 3.5, '2026-05-15'),
      ('RUET', 3.5, 3.5, '2026-05-25'),
      ('CUET', 3.5, 3.5, '2026-05-25'),
      ('KUET', 3.5, 3.5, '2026-05-25'),
      ('DMC', 3.5, 3.5, '2026-02-10'),
      ('RU', 3.0, 3.0, '2026-05-20'),
      ('CU', 3.0, 3.0, '2026-06-15'),
      ('JU', 3.0, 3.0, '2026-06-10')
    `);
  }

  const circCount = await db.get('SELECT COUNT(*) as c FROM circulars');
  if (circCount.c === 0) {
    await db.run(`INSERT INTO circulars (title, university, deadline) VALUES 
      ('BUET Admission 2026', 'BUET', '2026-04-30'),
      ('DU Ka Unit Application', 'DU', '2026-04-10'),
      ('RUET Form Fill-up', 'RUET', '2026-04-15')
    `);
  }

  const adminExists = await db.get('SELECT * FROM users WHERE email = ?', ['admin@path2uni.com']);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run(
      'INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin@path2uni.com', hashedPassword, 1]
    );
    console.log('Admin created');
  }

  console.log('Database ready');
}

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
async function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin;
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============ AUTH ROUTES ============

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  try {
    const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );
    
    const token = jwt.sign({ userId: result.lastID, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [result.lastID, token, expiresAt.toISOString()]);
    
    res.json({ token, user: { id: result.lastID, name, email, isAdmin: false } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
    
    const token = jwt.sign({ userId: user.id, isAdmin: user.is_admin === 1 }, JWT_SECRET, { expiresIn: '7d' });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expiresAt.toISOString()]);
    
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.is_admin === 1 } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', auth, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.get('SELECT id, name, email, ssc_gpa, hsc_gpa, is_admin FROM users WHERE id = ?', [req.userId]);
  res.json({ user });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  const { ssc_gpa, hsc_gpa, biology_gpa } = req.body;
  await db.run('UPDATE users SET ssc_gpa = ?, hsc_gpa = ?, biology_gpa = ? WHERE id = ?', [ssc_gpa, hsc_gpa, biology_gpa, req.userId]);
  res.json({ message: 'Profile updated' });
});

// ============ DASHBOARD ROUTES ============

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    const applications = await db.all('SELECT * FROM applications WHERE user_id = ?', [req.userId]);
    const circulars = await db.all('SELECT * FROM circulars WHERE is_active = 1');
    const notifications = await db.all('SELECT * FROM notifications WHERE user_id = ? AND is_read = 0', [req.userId]);
    
    let eligibleUniversities = [];
    if (user.ssc_gpa && user.hsc_gpa) {
      eligibleUniversities = await db.all(
        'SELECT * FROM universities WHERE min_ssc <= ? AND min_hsc <= ?',
        [user.ssc_gpa, user.hsc_gpa]
      );
    }
    
    const nextExam = await db.get('SELECT * FROM circulars WHERE deadline >= date("now") ORDER BY deadline LIMIT 1');
    
    res.json({
      user,
      applications: applications || [],
      circulars: circulars || [],
      notifications: notifications || [],
      eligibleUniversities: eligibleUniversities || [],
      nextExam
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ APPLICATION ROUTES ============

app.post('/api/applications', auth, async (req, res) => {
  const { university_name } = req.body;
  await db.run('INSERT INTO applications (user_id, university_name) VALUES (?, ?)', [req.userId, university_name]);
  await db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)', 
    [req.userId, 'Application Submitted', `You applied to ${university_name}`]);
  res.json({ message: 'Applied successfully' });
});

app.get('/api/applications/my', auth, async (req, res) => {
  const apps = await db.all('SELECT * FROM applications WHERE user_id = ?', [req.userId]);
  res.json({ applications: apps });
});

// ============ NOTIFICATION ROUTES ============

app.get('/api/notifications', auth, async (req, res) => {
  const notifs = await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
  res.json({ notifications: notifs });
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Marked read' });
});

// ============ CIRCULAR ROUTES ============

app.get('/api/circulars', async (req, res) => {
  const circulars = await db.all('SELECT * FROM circulars WHERE is_active = 1');
  res.json({ circulars });
});

// ============ ADMIN ROUTES ============

app.get('/api/admin/users', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const users = await db.all('SELECT id, name, email, is_admin, created_at FROM users');
  res.json({ users });
});

app.delete('/api/admin/users/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  await db.run('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ message: 'User deleted' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
