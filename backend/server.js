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
if (process.env.GEMINI_API_KEY) {
  geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('✅ Gemini AI initialized');
} else {
  console.log('⚠️ GEMINI_API_KEY not set. Chatbot will use fallback responses.');
}

// Email transporter setup
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  console.log('✅ Email notifications enabled');
} else {
  console.log('⚠️ Email not configured - notifications will be in-app only');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

let db;

// Email sending function
async function sendEmailNotification(userEmail, userName, title, message, type = 'info') {
  if (!transporter) {
    console.log('Email not configured - skipping email notification');
    return false;
  }
  
  try {
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: #0a0a1a; }
          .container { max-width: 600px; margin: 0 auto; background: #0f0f23; border-radius: 16px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #3b82f6, #7c3aed); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { padding: 30px; color: #e0e0e0; }
          .content h2 { color: white; margin-top: 0; }
          .button { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #3b82f6, #7c3aed); color: white; text-decoration: none; border-radius: 30px; margin-top: 20px; }
          .footer { padding: 20px; text-align: center; border-top: 1px solid #1a1a3a; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Path2Uni</h1>
            <p style="color: #ccc; margin: 5px 0 0;">University Admission Hub</p>
          </div>
          <div class="content">
            <h2>${title}</h2>
            <p>Dear ${userName},</p>
            <p>${message}</p>
            <a href="https://nahedece.github.io/Path2Uni/dashboard.html" class="button">Go to Dashboard</a>
          </div>
          <div class="footer">
            <p>© 2026 Path2Uni. All rights reserved.</p>
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    await transporter.sendMail({
      from: `"Path2Uni" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: title,
      html: emailHtml
    });
    console.log(`📧 Email sent to ${userEmail}: ${title}`);
    return true;
  } catch(error) {
    console.error('Email error:', error);
    return false;
  }
}

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
      phone TEXT,
      is_admin INTEGER DEFAULT 0,
      email_notifications INTEGER DEFAULT 1,
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
      email_sent INTEGER DEFAULT 0,
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
      ('Rajshahi University', 'RU', 'general', 3.0, 3.0, 6.5, NULL, '2026-05-20', 'https://admission.ru.ac.bd'),
      ('Chittagong University', 'CU', 'general', 3.0, 3.0, 6.5, NULL, '2026-06-15', 'https://admission.cu.ac.bd'),
      ('Jahangirnagar University', 'JU', 'general', 3.0, 3.0, 6.5, NULL, '2026-06-10', 'https://admission.juniv.edu')
    `);
  }

  // Insert sample exam dates
  const examCount = await db.get('SELECT COUNT(*) as c FROM exam_dates');
  if (examCount.c === 0) {
    await db.run(`INSERT INTO exam_dates (title, university, exam_date, exam_time, venue) VALUES 
      ('BUET Admission Test', 'BUET', '2026-05-25', '10:00 AM', 'BUET Campus'),
      ('DU Ka Unit Exam', 'DU', '2026-05-15', '10:00 AM', 'DU Campus'),
      ('RUET Admission Test', 'RUET', '2026-05-25', '10:00 AM', 'RUET Campus'),
      ('Medical Admission Test', 'DGHS', '2026-02-10', '10:00 AM', 'Various Centers')
    `);
  }

  // Insert sample circulars
  const circCount = await db.get('SELECT COUNT(*) as c FROM circulars');
  if (circCount.c === 0) {
    await db.run(`INSERT INTO circulars (title, university, description, application_link, application_start, application_deadline, exam_date) VALUES 
      ('BUET Admission 2026', 'BUET', 'Applications for undergraduate programs in Engineering', 'https://ugadmission.buet.ac.bd', '2026-03-01', '2026-03-30', '2026-05-25'),
      ('DU Ka Unit Admission', 'DU', 'Admission for Science unit (Ka)', 'https://admission.eis.du.ac.bd', '2026-03-10', '2026-04-05', '2026-05-15'),
      ('RUET Admission Circular', 'RUET', 'Engineering admission for 2025-26 session', 'https://admission.ruet.ac.bd', '2026-03-05', '2026-04-05', '2026-05-25')
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  const { name, email, password, ssc_gpa, hsc_gpa, biology_gpa, phone } = req.body;
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
      'INSERT INTO users (name, email, password, ssc_gpa, hsc_gpa, biology_gpa, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, ssc_gpa || null, hsc_gpa || null, biology_gpa || null, phone || null]
    );
    
    const token = jwt.sign({ userId: result.lastID, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [result.lastID, token, expiresAt.toISOString()]);
    
    // Create welcome notification
    await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [result.lastID, 'Welcome to Path2Uni!', 'Thank you for joining. Start by checking your eligibility for universities.', 'success']);
    
    // Send welcome email
    await sendEmailNotification(email, name, 'Welcome to Path2Uni!', 'Thank you for registering with Path2Uni. Start your admission journey today by checking your eligibility for universities across Bangladesh.');
    
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
    
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        avatar: user.avatar,
        phone: user.phone,
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
  const user = await db.get('SELECT id, name, email, ssc_gpa, hsc_gpa, biology_gpa, avatar, phone, is_admin FROM users WHERE id = ?', [req.userId]);
  res.json({ user });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  const { name, phone, ssc_gpa, hsc_gpa, biology_gpa, avatar, email_notifications } = req.body;
  const updates = [];
  const values = [];
  
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
  if (ssc_gpa !== undefined) { updates.push('ssc_gpa = ?'); values.push(ssc_gpa); }
  if (hsc_gpa !== undefined) { updates.push('hsc_gpa = ?'); values.push(hsc_gpa); }
  if (biology_gpa !== undefined) { updates.push('biology_gpa = ?'); values.push(biology_gpa); }
  if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
  if (email_notifications !== undefined) { updates.push('email_notifications = ?'); values.push(email_notifications ? 1 : 0); }
  
  if (updates.length === 0) {
    return res.json({ message: 'No updates' });
  }
  
  values.push(req.userId);
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ message: 'Profile updated' });
});

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
    const studyTasks = await db.all('SELECT * FROM study_tasks WHERE user_id = ? AND task_date >= date("now", "-7 days") ORDER BY task_date DESC, task_time ASC', [req.userId]);
    
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
    
    const nextExam = await db.get('SELECT * FROM exam_dates WHERE exam_date >= date("now") ORDER BY exam_date LIMIT 1');
    
    // Check deadlines and create notifications
    for (const circ of circulars) {
      const daysLeft = Math.ceil((new Date(circ.application_deadline) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft > 0) {
        const existing = await db.get('SELECT id FROM notifications WHERE user_id = ? AND title LIKE ? AND date(created_at) = date("now")', 
          [req.userId, `%${circ.title}%`]);
        if (!existing) {
          const message = `Application deadline for ${circ.university} is in ${daysLeft} days on ${circ.application_deadline}. Apply now!`;
          await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [req.userId, `⚠️ Deadline Approaching: ${circ.title}`, message, 'deadline']);
          
          // Send email notification if user has email notifications enabled
          if (user.email_notifications && user.email) {
            await sendEmailNotification(user.email, user.name, `Deadline Approaching: ${circ.title}`, message);
            await db.run('UPDATE notifications SET email_sent = 1 WHERE user_id = ? AND title LIKE ?', [req.userId, `%${circ.title}%`]);
          }
        }
      }
    }
    
    res.json({
      user,
      applications: applications || [],
      circulars: circulars || [],
      notifications: notifications || [],
      eligibleUniversities: eligibleUniversities || [],
      nextExam,
      studyTasks: studyTasks || []
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ STUDY TRACKER ROUTES ============

app.get('/api/study/tasks', auth, async (req, res) => {
  const { date } = req.query;
  let query = 'SELECT * FROM study_tasks WHERE user_id = ?';
  const params = [req.userId];
  
  if (date) {
    query += ' AND task_date = ?';
    params.push(date);
  }
  
  query += ' ORDER BY task_time ASC';
  const tasks = await db.all(query, params);
  res.json({ tasks });
});

app.post('/api/study/task', auth, async (req, res) => {
  const { task_title, task_time, task_date } = req.body;
  if (!task_title) return res.status(400).json({ error: 'Task title required' });
  
  const result = await db.run(
    'INSERT INTO study_tasks (user_id, task_title, task_time, task_date) VALUES (?, ?, ?, ?)',
    [req.userId, task_title, task_time || null, task_date || new Date().toISOString().split('T')[0]]
  );
  
  res.json({ message: 'Task added', id: result.lastID });
});

app.put('/api/study/task/:id/toggle', auth, async (req, res) => {
  const task = await db.get('SELECT is_completed FROM study_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  
  const newStatus = task.is_completed ? 0 : 1;
  await db.run('UPDATE study_tasks SET is_completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, req.params.id]);
  
  if (newStatus === 1) {
    const user = await db.get('SELECT name, email, email_notifications FROM users WHERE id = ?', [req.userId]);
    await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [req.userId, 'Task Completed!', 'Great job! Keep up the good work on your study plan.', 'success']);
    
    if (user.email_notifications && user.email) {
      await sendEmailNotification(user.email, user.name, 'Study Task Completed!', 'Congratulations on completing your study task! Keep up the great work on your admission preparation.');
    }
  }
  
  res.json({ message: 'Task updated', completed: newStatus === 1 });
});

app.delete('/api/study/task/:id', auth, async (req, res) => {
  await db.run('DELETE FROM study_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  res.json({ message: 'Task deleted' });
});

// ============ CALENDAR / EXAM DATES ROUTES ============

app.get('/api/exam-dates', async (req, res) => {
  const examDates = await db.all('SELECT * FROM exam_dates ORDER BY exam_date ASC');
  res.json({ examDates });
});

app.post('/api/admin/exam-date', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  
  const { title, university, exam_date, exam_time, venue, description } = req.body;
  if (!title || !university || !exam_date) {
    return res.status(400).json({ error: 'Title, university, and exam date required' });
  }
  
  const result = await db.run(
    'INSERT INTO exam_dates (title, university, exam_date, exam_time, venue, description, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, university, exam_date, exam_time || null, venue || null, description || null, req.userId]
  );
  
  // Notify all users about new exam date
  const users = await db.all('SELECT id, name, email, email_notifications FROM users');
  for (const user of users) {
    await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [user.id, `📅 New Exam Date Added: ${title}`, `${university} exam will be held on ${exam_date}. Prepare accordingly!`, 'info']);
    
    if (user.email_notifications && user.email) {
      await sendEmailNotification(user.email, user.name, `New Exam Date: ${title}`, `The ${title} for ${university} has been scheduled on ${exam_date} at ${exam_time || 'TBA'}. Good luck with your preparation!`);
    }
  }
  
  res.json({ message: 'Exam date added', id: result.lastID });
});

app.delete('/api/admin/exam-date/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  await db.run('DELETE FROM exam_dates WHERE id = ?', [req.params.id]);
  res.json({ message: 'Exam date deleted' });
});

// ============ CIRCULAR ROUTES ============

app.get('/api/circulars', async (req, res) => {
  const circulars = await db.all('SELECT * FROM circulars WHERE is_active = 1 ORDER BY application_deadline ASC');
  res.json({ circulars });
});

app.post('/api/admin/circulars', auth, upload.single('pdf'), async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  
  const { title, university, description, application_link, application_start, application_deadline, exam_date } = req.body;
  const pdfPath = req.file ? `/uploads/${req.file.filename}` : null;
  
  const result = await db.run(
    `INSERT INTO circulars (title, university, description, application_link, application_start, application_deadline, exam_date, pdf_path, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, university, description, application_link, application_start, application_deadline, exam_date, pdfPath, req.userId]
  );
  
  // Notify all users about new circular
  const users = await db.all('SELECT id, name, email, email_notifications FROM users');
  for (const user of users) {
    await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [user.id, `📢 New Circular: ${title}`, `${university} has published admission circular. Deadline: ${application_deadline}`, 'info']);
    
    if (user.email_notifications && user.email) {
      await sendEmailNotification(user.email, user.name, `New Admission Circular: ${title}`, `${university} has published their admission circular. Application deadline is ${application_deadline}. Apply before the deadline!`);
    }
  }
  
  res.json({ message: 'Circular created', id: result.lastID, pdfPath });
});

app.delete('/api/admin/circulars/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  
  const circular = await db.get('SELECT pdf_path FROM circulars WHERE id = ?', [req.params.id]);
  if (circular?.pdf_path) {
    const filePath = path.join(__dirname, circular.pdf_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  
  await db.run('DELETE FROM circulars WHERE id = ?', [req.params.id]);
  res.json({ message: 'Circular deleted' });
});

// ============ QUESTION BANK ROUTES ============

app.get('/api/question-banks', async (req, res) => {
  const { university, subject } = req.query;
  let query = 'SELECT * FROM question_banks WHERE 1=1';
  const params = [];
  
  if (university) {
    query += ' AND university = ?';
    params.push(university);
  }
  if (subject) {
    query += ' AND subject = ?';
    params.push(subject);
  }
  
  query += ' ORDER BY year DESC, created_at DESC';
  const questions = await db.all(query, params);
  res.json({ questions });
});

app.post('/api/admin/question-banks', auth, upload.single('pdf'), async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  
  const { title, university, subject, year } = req.body;
  if (!req.file) return res.status(400).json({ error: 'PDF file required' });
  
  const pdfPath = `/uploads/${req.file.filename}`;
  
  const result = await db.run(
    `INSERT INTO question_banks (title, university, subject, year, pdf_path, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, university, subject, year || null, pdfPath, req.userId]
  );
  
  res.json({ message: 'Question bank added', id: result.lastID, pdfPath });
});

app.delete('/api/admin/question-banks/:id', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  
  const qb = await db.get('SELECT pdf_path FROM question_banks WHERE id = ?', [req.params.id]);
  if (qb?.pdf_path) {
    const filePath = path.join(__dirname, qb.pdf_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  
  await db.run('DELETE FROM question_banks WHERE id = ?', [req.params.id]);
  res.json({ message: 'Question bank deleted' });
});

// ============ UNIBUDDY AI CHATBOT WITH GEMINI ============

app.post('/api/chatbuddy', auth, async (req, res) => {
  const { message } = req.body;
  
  try {
    const user = await db.get('SELECT name, ssc_gpa, hsc_gpa, biology_gpa FROM users WHERE id = ?', [req.userId]);
    
    const systemPrompt = `You are UniBuddy, a helpful AI assistant for Bangladeshi students seeking university admissions.
    
User Information:
- Name: ${user?.name || 'Student'}
- SSC GPA: ${user?.ssc_gpa || 'Not set'}
- HSC GPA: ${user?.hsc_gpa || 'Not set'}
- Biology GPA: ${user?.biology_gpa || 'Not set'}

You have knowledge about:
- BUET, DU, RUET, CUET, KUET, RU, CU, JU universities
- Medical colleges (DMC, MMC, SHMC)
- GST Cluster universities
- Application deadlines and requirements
- Exam schedules and admit cards
- Admission eligibility criteria based on GPA

Provide helpful, accurate, and friendly responses. Be specific with GPA requirements. If user's GPA is available, give personalized advice. Keep responses concise but informative.`;

    let reply = '';

    if (geminiAI) {
      const model = geminiAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: message }] }
        ]
      });
      reply = result.response.text();
    } else {
      reply = "I'm UniBuddy. I need a Gemini API key to work properly. Please add your GEMINI_API_KEY to the .env file. Get a free key from https://makersuite.google.com/app/apikey";
    }
    
    await db.run(
      'INSERT INTO chatbot_conversations (user_id, question, answer, ai_provider) VALUES (?, ?, ?, ?)',
      [req.userId, message, reply, geminiAI ? 'gemini' : 'none']
    );
    
    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.json({ reply: "I'm having trouble connecting to Gemini AI. Please check your API key or try again later." });
  }
});

// ============ APPLICATION ROUTES ============

app.post('/api/applications', auth, async (req, res) => {
  const { university_name, application_date } = req.body;
  const result = await db.run(
    'INSERT INTO applications (user_id, university_name, application_date) VALUES (?, ?, ?)',
    [req.userId, university_name, application_date || new Date().toISOString().split('T')[0]]
  );
  
  const user = await db.get('SELECT name, email, email_notifications FROM users WHERE id = ?', [req.userId]);
  
  await db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', 
    [req.userId, 'Application Submitted', `Your application to ${university_name} has been submitted successfully!`, 'success']);
  
  if (user.email_notifications && user.email) {
    await sendEmailNotification(user.email, user.name, 'Application Submitted Successfully', `Your application to ${university_name} has been submitted. We will notify you about any updates.`);
  }
  
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

// ============ UNIVERSITIES ROUTES ============

app.get('/api/universities', async (req, res) => {
  const universities = await db.all('SELECT * FROM universities ORDER BY name');
  res.json({ universities });
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
  await db.run('DELETE FROM study_tasks WHERE user_id = ?', [req.params.id]);
  await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ message: 'User deleted' });
});

app.get('/api/admin/stats', auth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  const appCount = await db.get('SELECT COUNT(*) as count FROM applications');
  const circCount = await db.get('SELECT COUNT(*) as count FROM circulars');
  const qbCount = await db.get('SELECT COUNT(*) as count FROM question_banks');
  const taskCount = await db.get('SELECT COUNT(*) as count FROM study_tasks');
  res.json({ users: userCount.count, applications: appCount.count, circulars: circCount.count, questionBanks: qbCount.count, studyTasks: taskCount.count });
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
    console.log(`🤖 Gemini AI: ${geminiAI ? 'Enabled' : 'Disabled - Add GEMINI_API_KEY'}`);
    console.log(`📧 Email Notifications: ${transporter ? 'Enabled' : 'Disabled'}`);
  });
});
