const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'path2uni_super_secret_key_2026';

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

let db;

async function initDB() {
  db = await sqlite.open({
    filename: path.join(__dirname, 'path2uni.db'),
    driver: sqlite3.Database
  });

  // Users table with avatar field
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      ssc_gpa REAL,
      hsc_gpa REAL,
      biology_gpa REAL,
      avatar TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // Sessions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Applications table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      university_name TEXT NOT NULL,
      application_date DATE,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Notifications table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Circulars table (admin managed)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS circulars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      university TEXT NOT NULL,
      description TEXT,
      application_link TEXT,
      application_start DATE,
      application_deadline DATE,
      exam_date DATE,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users (id)
    )
  `);

  // Universities table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS universities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT,
      category TEXT,
      min_ssc_gpa REAL,
      min_hsc_gpa REAL,
      min_combined_gpa REAL,
      min_biology_gpa REAL,
      exam_date TEXT,
      website TEXT,
      logo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Chatbot conversations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS chatbot_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      question TEXT,
      answer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default universities
  const uniCount = await db.get('SELECT COUNT(*) as c FROM universities');
  if (uniCount.c === 0) {
    await db.run(`INSERT INTO universities (name, short_name, category, min_ssc_gpa, min_hsc_gpa, min_combined_gpa, min_biology_gpa, exam_date, website) VALUES 
      ('Bangladesh University of Engineering and Technology', 'BUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://ugadmission.buet.ac.bd'),
      ('University of Dhaka', 'DU', 'general', 3.5, 3.5, 7.5, NULL, '2026-05-15', 'https://admission.eis.du.ac.bd'),
      ('Rajshahi University of Engineering and Technology', 'RUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://admission.ruet.ac.bd'),
      ('Chittagong University of Engineering and Technology', 'CUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://cuet.ac.bd/admission'),
      ('Khulna University of Engineering and Technology', 'KUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://admission.kuet.ac.bd'),
      ('Dhaka Medical College', 'DMC', 'medical', 3.5, 3.5, 7.0, 3.5, '2026-02-10', 'http://dgsh.teletalk.com.bd'),
      ('Mymensingh Medical College', 'MMC', 'medical', 3.5, 3.5, 7.0, 3.5, '2026-02-10', 'http://dgsh.teletalk.com.bd'),
      ('Sir Salimullah Medical College', 'SHMC', 'medical', 3.5, 3.5, 7.0, 3.5, '2026-02-10', 'http://dgsh.teletalk.com.bd'),
      ('Rajshahi University', 'RU', 'general', 3.0, 3.0, 6.5, NULL, '2026-05-20', 'https://admission.ru.ac.bd'),
      ('Chittagong University', 'CU', 'general', 3.0, 3.0, 6.5, NULL, '2026-06-15', 'https://admission.cu.ac.bd'),
      ('Jahangirnagar University', 'JU', 'general', 3.0, 3.0, 6.5, NULL, '2026-06-10', 'https://admission.juniv.edu'),
      ('Khulna University', 'KU', 'general', 3.0, 3.0, 6.5, NULL, '2026-06-25', 'https://ku.ac.bd/admission')
    `);
  }

  // Insert sample circulars (admin managed)
  const circCount = await db.get('SELECT COUNT(*) as c FROM circulars');
  if (circCount.c === 0) {
    await db.run(`INSERT INTO circulars (title, university, description, application_link, application_start, application_deadline, exam_date) VALUES 
      ('BUET Admission 2026', 'BUET', 'Applications are invited for admission into undergraduate programs in Engineering, Architecture, and Planning', 'https://ugadmission.buet.ac.bd', '2026-03-01', '2026-03-30', '2026-05-25'),
      ('DU Ka Unit Admission', 'DU', 'Admission circular for Science unit (Ka). Apply online through admission portal', 'https://admission.eis.du.ac.bd', '2026-03-10', '2026-04-05', '2026-05-15'),
      ('RUET Admission Circular', 'RUET', 'Engineering admission for 2025-26 session. Application fee 1000 BDT', 'https://admission.ruet.ac.bd', '2026-03-05', '2026-04-05', '2026-05-25'),
      ('Medical Admission Test 2026', 'DGHS', 'Combined medical admission test for MBBS/BDS courses', 'http://dgsh.teletalk.com.bd', '2025-12-01', '2025-12-31', '2026-02-10'),
      ('CUET Admission 2026', 'CUET', 'Applications for Engineering programs', 'https://cuet.ac.bd/admission', '2026-03-15', '2026-04-15', '2026-05-25')
    `);
  }

  // Create default admin user
  const adminExists = await db.get('SELECT * FROM users WHERE email = ?', ['admin@path2uni.com']);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run(
      'INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin@path2uni.com', hashedPassword, 1]
    );
    console.log('✅ Default admin created: admin@path2uni.com / admin123');
  }

  console.log('✅ Database initialized successfully');
  return db;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// Auth middleware
async function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const session = await db.get('SELECT * FROM sessions WHERE token = ? AND user_id = ?', [token, decoded.userId]);
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
  const { name, email, password, ssc_gpa, hsc_gpa, biology_gpa } = req.body;
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
      'INSERT INTO users (name, email, password, ssc_gpa, hsc_gpa, biology_gpa) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, ssc_gpa || null, hsc_gpa || null, biology_gpa || null]
    );
    
    const token = jwt.sign({ userId: result.lastID, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [result.lastID, token, expiresAt.toISOString()]);
    
    // Welcome notification
    await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [result.lastID, 'Welcome to Path2Uni!', 'Thank you for joining. Start by checking your eligibility for universities.', 'success']);
    
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
    
    // Delete old sessions (single session per user)
    await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
    
    const token = jwt.sign({ userId: user.id, isAdmin: user.is_admin === 1 }, JWT_SECRET, { expiresIn: '7d' });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expiresAt.toISOString()]);
    
    // Update last login
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        avatar: user.avatar,
        ssc_gpa: user.ssc_gpa,
        hsc_gpa: user.hsc_gpa,
        isAdmin: user.is_admin === 1 
      } 
    });
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
  const user = await db.get('SELECT id, name, email, ssc_gpa, hsc_gpa, biology_gpa, avatar, is_admin FROM users WHERE id = ?', [req.userId]);
  res.json({ user });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  const { name, phone, ssc_gpa, hsc_gpa, biology_gpa, avatar } = req.body;
  const updates = [];
  const values = [];
  
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
  if (ssc_gpa !== undefined) { updates.push('ssc_gpa = ?'); values.push(ssc_gpa); }
  if (hsc_gpa !== undefined) { updates.push('hsc_gpa = ?'); values.push(hsc_gpa); }
  if (biology_gpa !== undefined) { updates.push('biology_gpa = ?'); values.push(biology_gpa); }
  if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
  
  if (updates.length === 0) {
    return res.json({ message: 'No updates' });
  }
  
  values.push(req.userId);
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ message: 'Profile updated' });
});

// Avatar upload - save as base64 in database
app.post('/api/auth/avatar', auth, async (req, res) => {
  const { avatar } = req.body;
  await db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId]);
  res.json({ message: 'Avatar saved' });
});

// ============ DASHBOARD ROUTE ============

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    const applications = await db.all('SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
    const circulars = await db.all('SELECT * FROM circulars WHERE is_active = 1 AND application_deadline >= date("now") ORDER BY application_deadline ASC');
    const notifications = await db.all('SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 10', [req.userId]);
    
    let eligibleUniversities = [];
    if (user.ssc_gpa && user.hsc_gpa) {
      const combinedGpa = user.ssc_gpa + user.hsc_gpa;
      let query = `SELECT * FROM universities WHERE min_ssc_gpa <= ? AND min_hsc_gpa <= ? AND min_combined_gpa <= ?`;
      let params = [user.ssc_gpa, user.hsc_gpa, combinedGpa];
      
      if (user.biology_gpa) {
        query += ` AND (min_biology_gpa IS NULL OR min_biology_gpa <= ?)`;
        params.push(user.biology_gpa);
      }
      
      eligibleUniversities = await db.all(query, params);
    }
    
    const nextExam = await db.get('SELECT * FROM circulars WHERE exam_date >= date("now") ORDER BY exam_date LIMIT 1');
    
    // Create automatic deadline notifications
    for (const circ of circulars) {
      const daysLeft = Math.ceil((new Date(circ.application_deadline) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft > 0) {
        const existing = await db.get('SELECT id FROM notifications WHERE user_id = ? AND title LIKE ? AND date(created_at) = date("now")', 
          [req.userId, `%${circ.title}%`]);
        if (!existing) {
          await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [req.userId, `⚠️ Deadline Approaching: ${circ.title}`, `Application deadline for ${circ.university} is in ${daysLeft} days on ${circ.application_deadline}. Apply now!`, 'deadline']);
        }
      }
    }
    
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
  const { university_name, application_date } = req.body;
  const result = await db.run(
    'INSERT INTO applications (user_id, university_name, application_date) VALUES (?, ?, ?)',
    [req.userId, university_name, application_date || new Date().toISOString().split('T')[0]]
  );
  
  await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', 
    [req.userId, 'Application Submitted', `Your application to ${university_name} has been submitted successfully!`, 'success']);
  
  res.json({ message: 'Applied successfully', id: result.lastID });
});

app.get('/api/applications/my', auth, async (req, res) => {
  const apps = await db.all('SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
  res.json({ applications: apps });
});

// ============ NOTIFICATION ROUTES ============

app.get('/api/notifications', auth, async (req, res) => {
  const notifs = await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [req.userId]);
  res.json({ notifications: notifs });
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  res.json({ message: 'Marked read' });
});

app.put('/api/notifications/read-all', auth, async (req, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.userId]);
  res.json({ message: 'All notifications marked read' });
});

// ============ CIRCULAR ROUTES ============

app.get('/api/circulars', async (req, res) => {
  const circulars = await db.all('SELECT * FROM circulars WHERE is_active = 1 ORDER BY application_deadline ASC');
  res.json({ circulars });
});

// Admin: Create circular
app.post('/api/admin/circulars', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  
  const { title, university, description, application_link, application_start, application_deadline, exam_date } = req.body;
  const result = await db.run(
    `INSERT INTO circulars (title, university, description, application_link, application_start, application_deadline, exam_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, university, description, application_link, application_start, application_deadline, exam_date, req.userId]
  );
  res.json({ message: 'Circular created', id: result.lastID });
});

// Admin: Update circular
app.put('/api/admin/circulars/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  
  const { title, university, description, application_link, application_start, application_deadline, exam_date, is_active } = req.body;
  await db.run(
    `UPDATE circulars SET title = ?, university = ?, description = ?, application_link = ?, application_start = ?, application_deadline = ?, exam_date = ?, is_active = ? WHERE id = ?`,
    [title, university, description, application_link, application_start, application_deadline, exam_date, is_active, req.params.id]
  );
  res.json({ message: 'Circular updated' });
});

// Admin: Delete circular
app.delete('/api/admin/circulars/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  await db.run('DELETE FROM circulars WHERE id = ?', [req.params.id]);
  res.json({ message: 'Circular deleted' });
});

// ============ UNIVERSITIES ROUTES ============

app.get('/api/universities', async (req, res) => {
  const universities = await db.all('SELECT * FROM universities ORDER BY name');
  res.json({ universities });
});

// ============ CHATBOT ROUTE (UniBuddy) ============

const chatbotKnowledge = {
  'buet': 'BUET (Bangladesh University of Engineering and Technology) requires SSC GPA ≥ 3.50, HSC GPA ≥ 3.50, and combined GPA ≥ 8.00. Application starts in March, exam in May. Website: https://ugadmission.buet.ac.bd',
  'du': 'Dhaka University has multiple units. For Science (Ka Unit), you need SSC+HSC combined GPA ≥ 7.5. Application通常在 March-April, exam in May. Website: https://admission.eis.du.ac.bd',
  'ruet': 'RUET requires SSC and HSC GPA ≥ 3.50 each, combined ≥ 8.00. Application March-April, exam May. Website: https://admission.ruet.ac.bd',
  'cuet': 'CUET requires SSC and HSC GPA ≥ 3.50 each, combined ≥ 8.00. Website: https://cuet.ac.bd/admission',
  'kuet': 'KUET requires SSC and HSC GPA ≥ 3.50 each, combined ≥ 8.00. Website: https://admission.kuet.ac.bd',
  'medical': 'Medical admission requires SSC GPA ≥ 3.50, HSC GPA ≥ 3.50, and Biology GPA ≥ 3.50. Exam通常在 February. Apply through DGHS portal: http://dgsh.teletalk.com.bd',
  'deadline': 'Current application deadlines: Check the circulars section on dashboard for the most up-to-date deadlines.',
  'eligibility': 'To check eligibility, go to Eligibility Checker page and enter your SSC and HSC GPA. The system will show all universities you qualify for.',
  'apply': 'To apply, go to the circulars section and click the Apply button next to the university you want to apply to.',
  'result': 'Results are typically published 2-3 months after exams. Check the respective university website for updates.',
  'gpa': 'Combined GPA = SSC GPA + HSC GPA. Most public universities require 7.0-8.5 combined GPA.',
  'admit': 'Admit cards are usually available 1-2 weeks before the exam on the university admission portal.',
  'fee': 'Application fees range from 500-1500 BDT depending on the university.',
  'help': 'I can help you with information about BUET, DU, RUET, CUET, KUET, medical admission, deadlines, eligibility criteria, application process, and more!'
};

app.post('/api/chatbot', auth, async (req, res) => {
  const { message } = req.body;
  const lowerMsg = message.toLowerCase();
  let reply = "I'm UniBuddy, your admission assistant. I can help you with information about BUET, DU, RUET, CUET, KUET, medical colleges, deadlines, eligibility criteria, and application processes. What would you like to know?";
  
  if (lowerMsg.includes('buet')) reply = chatbotKnowledge.buet;
  else if (lowerMsg.includes('du') || lowerMsg.includes('dhaka university')) reply = chatbotKnowledge.du;
  else if (lowerMsg.includes('ruet')) reply = chatbotKnowledge.ruet;
  else if (lowerMsg.includes('cuet')) reply = chatbotKnowledge.cuet;
  else if (lowerMsg.includes('kuet')) reply = chatbotKnowledge.kuet;
  else if (lowerMsg.includes('medical') || lowerMsg.includes('mbbs') || lowerMsg.includes('dmc')) reply = chatbotKnowledge.medical;
  else if (lowerMsg.includes('deadline') || lowerMsg.includes('date')) reply = chatbotKnowledge.deadline;
  else if (lowerMsg.includes('eligible') || lowerMsg.includes('qualify')) reply = chatbotKnowledge.eligibility;
  else if (lowerMsg.includes('apply') || lowerMsg.includes('application')) reply = chatbotKnowledge.apply;
  else if (lowerMsg.includes('result')) reply = chatbotKnowledge.result;
  else if (lowerMsg.includes('gpa')) reply = chatbotKnowledge.gpa;
  else if (lowerMsg.includes('admit') || lowerMsg.includes('admit card')) reply = chatbotKnowledge.admit;
  else if (lowerMsg.includes('fee') || lowerMsg.includes('cost')) reply = chatbotKnowledge.fee;
  else if (lowerMsg.includes('help') || lowerMsg.includes('what can you do')) reply = chatbotKnowledge.help;
  else if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) reply = "Hello! I'm UniBuddy. How can I help you with your admission journey today?";
  
  // Save conversation
  await db.run('INSERT INTO chatbot_conversations (user_id, question, answer) VALUES (?, ?, ?)', [req.userId, message, reply]);
  
  res.json({ reply });
});

// ============ ADMIN ROUTES ============

app.get('/api/admin/users', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const users = await db.all('SELECT id, name, email, is_admin, created_at, last_login FROM users ORDER BY created_at DESC');
  res.json({ users });
});

app.delete('/api/admin/users/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  await db.run('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM notifications WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM applications WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ message: 'User deleted' });
});

app.get('/api/admin/stats', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  const appCount = await db.get('SELECT COUNT(*) as count FROM applications');
  const circCount = await db.get('SELECT COUNT(*) as count FROM circulars');
  res.json({ users: userCount.count, applications: appCount.count, circulars: circCount.count });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👑 Admin login: admin@path2uni.com / admin123`);
  });
});
