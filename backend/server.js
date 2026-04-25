const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'path2uni_super_secret_key_2026';

// Initialize Gemini AI
let geminiAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
  geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('✅ Gemini AI initialized');
}

// Email transporter
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_USER !== 'your-email@gmail.com') {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  console.log('✅ Email notifications enabled');
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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

  // Circulars table
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
      pdf_path TEXT,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users (id)
    )
  `);

  // Question Banks table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS question_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      university TEXT NOT NULL,
      subject TEXT,
      year INTEGER,
      pdf_path TEXT NOT NULL,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users (id)
    )
  `);

  // Study Tasks table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS study_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_title TEXT NOT NULL,
      task_time TEXT,
      task_date DATE,
      is_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Exam Dates table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS exam_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      university TEXT NOT NULL,
      exam_date DATE NOT NULL,
      exam_time TEXT,
      venue TEXT,
      description TEXT,
      added_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (added_by) REFERENCES users (id)
    )
  `);

  // Chatbot conversations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS chatbot_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      question TEXT,
      answer TEXT,
      ai_provider TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default data
  const uniCount = await db.get('SELECT COUNT(*) as c FROM universities');
  if (uniCount.c === 0) {
    await db.run(`INSERT INTO universities (name, short_name, category, min_ssc_gpa, min_hsc_gpa, min_combined_gpa, min_biology_gpa, exam_date, website) VALUES 
      ('BUET', 'BUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://ugadmission.buet.ac.bd'),
      ('DU', 'DU', 'general', 3.5, 3.5, 7.5, NULL, '2026-05-15', 'https://admission.eis.du.ac.bd'),
      ('RUET', 'RUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://admission.ruet.ac.bd'),
      ('CUET', 'CUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://cuet.ac.bd/admission'),
      ('KUET', 'KUET', 'engineering', 3.5, 3.5, 8.0, NULL, '2026-05-25', 'https://admission.kuet.ac.bd'),
      ('DMC', 'DMC', 'medical', 3.5, 3.5, 7.0, 3.5, '2026-02-10', 'http://dgsh.teletalk.com.bd')
    `);
  }

  const examCount = await db.get('SELECT COUNT(*) as c FROM exam_dates');
  if (examCount.c === 0) {
    await db.run(`INSERT INTO exam_dates (title, university, exam_date, exam_time, venue) VALUES 
      ('BUET Admission Test', 'BUET', '2026-05-25', '10:00 AM', 'BUET Campus'),
      ('DU Ka Unit Exam', 'DU', '2026-05-15', '10:00 AM', 'DU Campus'),
      ('RUET Admission Test', 'RUET', '2026-05-25', '10:00 AM', 'RUET Campus')
    `);
  }

  const circCount = await db.get('SELECT COUNT(*) as c FROM circulars');
  if (circCount.c === 0) {
    await db.run(`INSERT INTO circulars (title, university, description, application_link, application_start, application_deadline, exam_date) VALUES 
      ('BUET Admission 2026', 'BUET', 'Applications for undergraduate programs', 'https://ugadmission.buet.ac.bd', '2026-03-01', '2026-03-30', '2026-05-25'),
      ('DU Ka Unit Admission', 'DU', 'Admission for Science unit', 'https://admission.eis.du.ac.bd', '2026-03-10', '2026-04-05', '2026-05-15')
    `);
  }

  const adminExists = await db.get('SELECT * FROM users WHERE email = ?', ['admin@path2uni.com']);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run('INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)', 
      ['Administrator', 'admin@path2uni.com', hashedPassword, 1]);
    console.log('✅ Admin created');
  }

  console.log('✅ Database ready');
  return db;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

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
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// ============ AUTH ROUTES ============

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  
  const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'Email already exists' });
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
  
  const token = jwt.sign({ userId: result.lastID, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [result.lastID, token, expiresAt.toISOString()]);
  
  res.json({ token, user: { id: result.lastID, name, email, isAdmin: false } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
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
});

app.post('/api/auth/logout', auth, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.get('SELECT id, name, email, avatar, is_admin FROM users WHERE id = ?', [req.userId]);
  res.json({ user });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  const { name, ssc_gpa, hsc_gpa } = req.body;
  await db.run('UPDATE users SET name = COALESCE(?, name), ssc_gpa = COALESCE(?, ssc_gpa), hsc_gpa = COALESCE(?, hsc_gpa) WHERE id = ?', 
    [name, ssc_gpa, hsc_gpa, req.userId]);
  res.json({ message: 'Profile updated' });
});

app.post('/api/auth/avatar', auth, async (req, res) => {
  const { avatar } = req.body;
  await db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId]);
  res.json({ message: 'Avatar saved' });
});

// ============ DASHBOARD ============

app.get('/api/dashboard', auth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
  const applications = await db.all('SELECT * FROM applications WHERE user_id = ?', [req.userId]);
  const circulars = await db.all('SELECT * FROM circulars WHERE is_active = 1 AND application_deadline >= date("now")');
  const notifications = await db.all('SELECT * FROM notifications WHERE user_id = ? AND is_read = 0', [req.userId]);
  const studyTasks = await db.all('SELECT * FROM study_tasks WHERE user_id = ?', [req.userId]);
  
  let eligibleUniversities = [];
  if (user.ssc_gpa && user.hsc_gpa) {
    eligibleUniversities = await db.all('SELECT * FROM universities WHERE min_ssc_gpa <= ? AND min_hsc_gpa <= ?', [user.ssc_gpa, user.hsc_gpa]);
  }
  
  const nextExam = await db.get('SELECT * FROM exam_dates WHERE exam_date >= date("now") ORDER BY exam_date LIMIT 1');
  
  res.json({ user, applications, circulars, notifications, eligibleUniversities, nextExam, studyTasks });
});

// ============ STUDY TRACKER ============

app.get('/api/study/tasks', auth, async (req, res) => {
  const { date } = req.query;
  let query = 'SELECT * FROM study_tasks WHERE user_id = ?';
  const params = [req.userId];
  if (date) { query += ' AND task_date = ?'; params.push(date); }
  query += ' ORDER BY task_time ASC';
  res.json({ tasks: await db.all(query, params) });
});

app.post('/api/study/task', auth, async (req, res) => {
  const { task_title, task_time, task_date } = req.body;
  const result = await db.run('INSERT INTO study_tasks (user_id, task_title, task_time, task_date) VALUES (?, ?, ?, ?)', 
    [req.userId, task_title, task_time || null, task_date || new Date().toISOString().split('T')[0]]);
  res.json({ message: 'Task added', id: result.lastID });
});

app.put('/api/study/task/:id/toggle', auth, async (req, res) => {
  const task = await db.get('SELECT is_completed FROM study_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const newStatus = task.is_completed ? 0 : 1;
  await db.run('UPDATE study_tasks SET is_completed = ? WHERE id = ?', [newStatus, req.params.id]);
  res.json({ message: 'Task updated', completed: newStatus === 1 });
});

app.delete('/api/study/task/:id', auth, async (req, res) => {
  await db.run('DELETE FROM study_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  res.json({ message: 'Task deleted' });
});

// ============ EXAM DATES ============

app.get('/api/exam-dates', async (req, res) => {
  res.json({ examDates: await db.all('SELECT * FROM exam_dates ORDER BY exam_date ASC') });
});

app.post('/api/admin/exam-date', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { title, university, exam_date, exam_time, venue, description } = req.body;
  await db.run('INSERT INTO exam_dates (title, university, exam_date, exam_time, venue, description, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, university, exam_date, exam_time, venue, description, req.userId]);
  res.json({ message: 'Exam date added' });
});

app.delete('/api/admin/exam-date/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  await db.run('DELETE FROM exam_dates WHERE id = ?', [req.params.id]);
  res.json({ message: 'Exam date deleted' });
});

// ============ CIRCULARS ============

app.get('/api/circulars', async (req, res) => {
  res.json({ circulars: await db.all('SELECT * FROM circulars WHERE is_active = 1 ORDER BY application_deadline ASC') });
});

app.post('/api/admin/circulars', auth, upload.single('pdf'), async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { title, university, description, application_link, application_start, application_deadline, exam_date } = req.body;
  const pdfPath = req.file ? `/uploads/${req.file.filename}` : null;
  await db.run(`INSERT INTO circulars (title, university, description, application_link, application_start, application_deadline, exam_date, pdf_path, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, university, description, application_link, application_start, application_deadline, exam_date, pdfPath, req.userId]);
  res.json({ message: 'Circular created' });
});

app.delete('/api/admin/circulars/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const circ = await db.get('SELECT pdf_path FROM circulars WHERE id = ?', [req.params.id]);
  if (circ?.pdf_path) { const p = path.join(__dirname, circ.pdf_path); if (fs.existsSync(p)) fs.unlinkSync(p); }
  await db.run('DELETE FROM circulars WHERE id = ?', [req.params.id]);
  res.json({ message: 'Circular deleted' });
});

// ============ QUESTION BANKS ============

app.get('/api/question-banks', async (req, res) => {
  const { university, subject } = req.query;
  let query = 'SELECT * FROM question_banks WHERE 1=1';
  const params = [];
  if (university) { query += ' AND university = ?'; params.push(university); }
  if (subject) { query += ' AND subject = ?'; params.push(subject); }
  query += ' ORDER BY year DESC';
  res.json({ questions: await db.all(query, params) });
});

app.post('/api/admin/question-banks', auth, upload.single('pdf'), async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { title, university, subject, year } = req.body;
  if (!req.file) return res.status(400).json({ error: 'PDF required' });
  const pdfPath = `/uploads/${req.file.filename}`;
  await db.run('INSERT INTO question_banks (title, university, subject, year, pdf_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [title, university, subject, year, pdfPath, req.userId]);
  res.json({ message: 'Question bank added' });
});

app.delete('/api/admin/question-banks/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const qb = await db.get('SELECT pdf_path FROM question_banks WHERE id = ?', [req.params.id]);
  if (qb?.pdf_path) { const p = path.join(__dirname, qb.pdf_path); if (fs.existsSync(p)) fs.unlinkSync(p); }
  await db.run('DELETE FROM question_banks WHERE id = ?', [req.params.id]);
  res.json({ message: 'Question bank deleted' });
});

// ============ APPLICATIONS ============

app.post('/api/applications', auth, async (req, res) => {
  const { university_name } = req.body;
  await db.run('INSERT INTO applications (user_id, university_name) VALUES (?, ?)', [req.userId, university_name]);
  res.json({ message: 'Applied successfully' });
});

app.get('/api/applications/my', auth, async (req, res) => {
  res.json({ applications: await db.all('SELECT * FROM applications WHERE user_id = ?', [req.userId]) });
});

// ============ NOTIFICATIONS ============

app.get('/api/notifications', auth, async (req, res) => {
  res.json({ notifications: await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.userId]) });
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Marked read' });
});

// ============ UNIBUDDY CHATBOT (GEMINI AI) ============

// ============ UNIBUDDY CHATBOT (GEMINI AI) - FIXED VERSION ============

app.post('/api/chatbuddy', auth, async (req, res) => {
  const { message } = req.body;
  console.log('Chatbot request received:', message);
  
  try {
    const user = await db.get('SELECT name, ssc_gpa, hsc_gpa FROM users WHERE id = ?', [req.userId]);
    
    // Check if Gemini is initialized
    if (!geminiAI) {
      console.log('Gemini not initialized, using fallback');
      const fallbackReply = getFallbackResponse(message, user);
      await db.run('INSERT INTO chatbot_conversations (user_id, question, answer, ai_provider) VALUES (?, ?, ?, ?)', 
        [req.userId, message, fallbackReply, 'fallback']);
      return res.json({ reply: fallbackReply });
    }
    
    // Create the prompt for Gemini
    const prompt = `You are UniBuddy, a helpful AI assistant for Bangladeshi students seeking university admissions.
    
User Information:
- Name: ${user?.name || 'Student'}
- SSC GPA: ${user?.ssc_gpa || 'Not set'}
- HSC GPA: ${user?.hsc_gpa || 'Not set'}

You have knowledge about:
- BUET, DU, RUET, CUET, KUET, RU, CU, JU universities
- Medical colleges (DMC, MMC, SHMC)
- Application deadlines and requirements
- Exam schedules and admit cards
- Admission eligibility criteria based on GPA

Provide helpful, accurate, and friendly responses. Be specific with GPA requirements. Keep responses concise.

User Question: ${message}

Answer:`;

    console.log('Calling Gemini API...');
    
    // Use the correct Gemini model
    const model = geminiAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      }
    });
    
    const reply = result.response.text();
    console.log('Gemini response received:', reply.substring(0, 100) + '...');
    
    // Save conversation
    await db.run('INSERT INTO chatbot_conversations (user_id, question, answer, ai_provider) VALUES (?, ?, ?, ?)', 
      [req.userId, message, reply, 'gemini']);
    
    res.json({ reply });
    
  } catch (error) {
    console.error('Chatbot error:', error);
    const fallbackReply = getFallbackResponse(message, null);
    res.json({ reply: fallbackReply });
  }
});

// Fallback response function (works without API)
function getFallbackResponse(message, user) {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('kuet')) {
    return 'KUET (Khulna University of Engineering and Technology) requires SSC and HSC GPA ≥ 3.50 each, combined ≥ 8.00. Application starts in March, exam in May.\n\nHow to apply:\n1. Visit https://admission.kuet.ac.bd\n2. Register with your HSC roll\n3. Fill the application form\n4. Pay fee (1000 BDT)\n5. Download admit card\n\nEligibility: Science background with Physics, Chemistry, Math required.';
  }
  else if (lowerMsg.includes('buet')) {
    return 'BUET requires SSC and HSC GPA ≥ 3.50 each, combined ≥ 8.00.\n\nHow to apply:\n1. Visit https://ugadmission.buet.ac.bd\n2. Register during March\n3. Submit application online\n4. Pay application fee\n5. Appear for admission test in May\n\nEligibility: Science background with PCM required.';
  }
  else if (lowerMsg.includes('du') || lowerMsg.includes('dhaka university')) {
    return 'Dhaka University (Ka Unit - Science) requires combined GPA ≥ 7.5.\n\nHow to apply:\n1. Visit https://admission.eis.du.ac.bd\n2. Application period: March-April\n3. Fill online form\n4. Exam in May\n\nEligibility: SSC and HSC GPA ≥ 3.50 each.';
  }
  else if (lowerMsg.includes('ruet')) {
    return 'RUET requires SSC and HSC GPA ≥ 3.50 each, combined ≥ 8.00.\n\nApply at: https://admission.ruet.ac.bd\nApplication: March-April\nExam: May\n\nEligibility: Science background with PCM.';
  }
  else if (lowerMsg.includes('cuet')) {
    return 'CUET requires SSC and HSC GPA ≥ 3.50 each, combined ≥ 8.00.\n\nApply at: https://cuet.ac.bd/admission\nApplication: March-April\nExam: May';
  }
  else if (lowerMsg.includes('medical') || lowerMsg.includes('dmc') || lowerMsg.includes('mbbs')) {
    return 'Medical admission (MBBS/BDS) requires:\n• SSC GPA ≥ 3.50\n• HSC GPA ≥ 3.50\n• Biology GPA ≥ 3.50\n\nExam通常在 February\nApply at: http://dgsh.teletalk.com.bd\n\nTop medical colleges: DMC, MMC, SHMC, SSMC, Rangpur Medical.';
  }
  else if (lowerMsg.includes('eligibility') || lowerMsg.includes('qualify')) {
    const gpaInfo = user && user.ssc_gpa && user.hsc_gpa 
      ? `Based on your GPA (SSC: ${user.ssc_gpa}, HSC: ${user.hsc_gpa}), go to the Eligibility Checker page to see which universities you qualify for.`
      : 'Go to the Eligibility Checker page and enter your SSC and HSC GPA to see which universities you qualify for.';
    return gpaInfo;
  }
  else if (lowerMsg.includes('deadline') || lowerMsg.includes('application date')) {
    return 'Current application deadlines:\n• BUET: March 1-30, 2026\n• DU: March 10 - April 5, 2026\n• RUET: March 5 - April 5, 2026\n• Medical: December 1-31, 2025\n\nCheck Live Circulars on dashboard for updates!';
  }
  else if (lowerMsg.includes('apply') || lowerMsg.includes('application process')) {
    return 'Application process:\n1. Check circular on dashboard\n2. Visit university admission portal\n3. Register with HSC roll\n4. Fill form and upload photo\n5. Pay application fee (500-1500 BDT)\n6. Download admit card\n7. Take exam\n\nNeed help with a specific university?';
  }
  else if (lowerMsg.includes('admit') || lowerMsg.includes('admit card')) {
    return 'Admit cards are usually available 1-2 weeks before the exam. Download from the university admission portal using your HSC roll and application ID.';
  }
  else if (lowerMsg.includes('result')) {
    return 'Results are typically published 2-3 months after exams. Check the respective university website for updates.';
  }
  else if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
    return `Hello ${user?.name || 'there'}! 👋 I'm UniBuddy. I can help you with:\n• KUET, BUET, DU, RUET admission requirements\n• Eligibility criteria and GPA requirements\n• Application deadlines and exam schedules\n• How to apply for specific universities\n\nWhat would you like to know?`;
  }
  else if (lowerMsg.includes('help') || lowerMsg.includes('what can you do')) {
    return 'I can help you with:\n• University admission requirements (KUET, BUET, DU, RUET, CUET, Medical)\n• Eligibility criteria based on your GPA\n• Application deadlines and exam schedules\n• How to apply for different universities\n• Admit card and result information\n\nJust ask me anything about university admissions in Bangladesh!';
  }
  
  return `I can help you with university admissions in Bangladesh! Ask me about:\n\n• KUET, BUET, DU, RUET admission requirements\n• Eligibility criteria and GPA requirements\n• Application deadlines and how to apply\n• Medical college admissions\n\nFor example: "How to apply for KUET?" or "What are the eligibility requirements for BUET?"`;
}

// ============ ADMIN ROUTES ============

app.get('/api/admin/users', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  res.json({ users: await db.all('SELECT id, name, email, is_admin, created_at FROM users') });
});

app.delete('/api/admin/users/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  await db.run('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ message: 'User deleted' });
});

app.get('/api/admin/stats', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const userCount = await db.get('SELECT COUNT(*) as c FROM users');
  const circCount = await db.get('SELECT COUNT(*) as c FROM circulars');
  const qbCount = await db.get('SELECT COUNT(*) as c FROM question_banks');
  const examCount = await db.get('SELECT COUNT(*) as c FROM exam_dates');
  res.json({ users: userCount.c, circulars: circCount.c, questionBanks: qbCount.c, examDates: examCount.c });
});

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
initDB().then(() => {
// Test Gemini endpoint (remove in production)
app.get('/api/test-gemini', async (req, res) => {
  if (!geminiAI) {
    return res.json({ error: 'Gemini not configured', geminiEnabled: false });
  }
  
  try {
    const model = geminiAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Say "Hello from Path2Uni!"' }] }]
    });
    res.json({ success: true, reply: result.response.text(), geminiEnabled: true });
  } catch (error) {
    res.json({ error: error.message, geminiEnabled: true });
  }
});
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👑 Admin: admin@path2uni.com / admin123`);
    console.log(`🤖 Gemini AI: ${geminiAI ? 'Enabled' : 'Disabled - Add API key'}`);
  });
});
