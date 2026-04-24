const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'path2uni_super_secret_key_2026';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

let db;

// Email configuration (configure with your email)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-password'
  }
});

// Database initialization
async function initializeDatabase() {
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
      hsc_roll TEXT,
      hsc_group TEXT,
      ssc_gpa REAL,
      hsc_gpa REAL,
      biology_gpa REAL,
      ssc_year INTEGER,
      hsc_year INTEGER,
      phone TEXT,
      district TEXT,
      avatar TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

  // User eligibility table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_eligibility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ssc_gpa REAL,
      hsc_gpa REAL,
      biology_gpa REAL,
      combined_gpa REAL,
      total_score REAL,
      eligible_universities TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Applications table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      university_name TEXT NOT NULL,
      unit_name TEXT,
      application_date DATE,
      exam_date DATE,
      status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'pending',
      admit_card_ready INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

  // Study sessions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      duration INTEGER,
      date DATE,
      completed INTEGER DEFAULT 0,
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
      application_start DATE,
      application_deadline DATE,
      exam_date DATE,
      link TEXT,
      is_active INTEGER DEFAULT 1,
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
      exam_date DATE,
      website TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Question banks table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS question_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      university TEXT NOT NULL,
      subject TEXT NOT NULL,
      year INTEGER,
      question_text TEXT NOT NULL,
      options TEXT,
      correct_answer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default universities
  const defaultUniversities = [
    { name: 'Bangladesh University of Engineering and Technology', short_name: 'BUET', category: 'engineering', min_ssc_gpa: 3.5, min_hsc_gpa: 3.5, min_combined_gpa: 8.0, exam_date: '2026-05-25', website: 'https://ugadmission.buet.ac.bd' },
    { name: 'University of Dhaka', short_name: 'DU', category: 'general', min_ssc_gpa: 3.5, min_hsc_gpa: 3.5, min_combined_gpa: 7.5, exam_date: '2026-05-15', website: 'https://admission.eis.du.ac.bd' },
    { name: 'Rajshahi University of Engineering and Technology', short_name: 'RUET', category: 'engineering', min_ssc_gpa: 3.5, min_hsc_gpa: 3.5, min_combined_gpa: 8.0, exam_date: '2026-05-25', website: 'https://admission.ruet.ac.bd' },
    { name: 'Chittagong University of Engineering and Technology', short_name: 'CUET', category: 'engineering', min_ssc_gpa: 3.5, min_hsc_gpa: 3.5, min_combined_gpa: 8.0, exam_date: '2026-05-25', website: 'https://cuet.ac.bd/admission' },
    { name: 'Khulna University of Engineering and Technology', short_name: 'KUET', category: 'engineering', min_ssc_gpa: 3.5, min_hsc_gpa: 3.5, min_combined_gpa: 8.0, exam_date: '2026-05-25', website: 'https://admission.kuet.ac.bd' },
    { name: 'Dhaka Medical College', short_name: 'DMC', category: 'medical', min_ssc_gpa: 3.5, min_hsc_gpa: 3.5, min_biology_gpa: 3.5, exam_date: '2026-02-10', website: 'http://dgsh.teletalk.com.bd' },
    { name: 'Rajshahi University', short_name: 'RU', category: 'general', min_ssc_gpa: 3.0, min_hsc_gpa: 3.0, min_combined_gpa: 6.5, exam_date: '2026-05-20', website: 'https://admission.ru.ac.bd' },
    { name: 'Chittagong University', short_name: 'CU', category: 'general', min_ssc_gpa: 3.0, min_hsc_gpa: 3.0, min_combined_gpa: 6.5, exam_date: '2026-06-15', website: 'https://admission.cu.ac.bd' },
    { name: 'Jahangirnagar University', short_name: 'JU', category: 'general', min_ssc_gpa: 3.0, min_hsc_gpa: 3.0, min_combined_gpa: 6.5, exam_date: '2026-06-10', website: 'https://admission.juniv.edu' },
    { name: 'GST Cluster', short_name: 'GST', category: 'general', min_ssc_gpa: 3.0, min_hsc_gpa: 3.0, min_combined_gpa: 6.0, exam_date: '2026-06-05', website: 'https://gstadmission.ac.bd' }
  ];

  for (const uni of defaultUniversities) {
    const exists = await db.get('SELECT * FROM universities WHERE short_name = ?', [uni.short_name]);
    if (!exists) {
      await db.run(
        `INSERT INTO universities (name, short_name, category, min_ssc_gpa, min_hsc_gpa, min_combined_gpa, min_biology_gpa, exam_date, website)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uni.name, uni.short_name, uni.category, uni.min_ssc_gpa, uni.min_hsc_gpa, uni.min_combined_gpa, uni.min_biology_gpa || null, uni.exam_date, uni.website]
      );
    }
  }

  // Insert sample circulars
  const circularsCount = await db.get('SELECT COUNT(*) as count FROM circulars');
  if (circularsCount.count === 0) {
    await db.run(`
      INSERT INTO circulars (title, university, description, application_start, application_deadline, exam_date, link) VALUES 
      ('BUET Admission 2026', 'BUET', 'Applications are invited for admission into undergraduate programs in Engineering, Architecture, and Planning', '2026-03-01', '2026-03-30', '2026-05-25', 'https://ugadmission.buet.ac.bd'),
      ('DU Ka Unit Admission', 'DU', 'Admission circular for Science unit (Ka). Apply online through admission portal', '2026-03-10', '2026-04-05', '2026-05-15', 'https://admission.eis.du.ac.bd'),
      ('RUET Admission Circular', 'RUET', 'Engineering admission for 2025-26 session. Application fee 1000 BDT', '2026-03-05', '2026-04-05', '2026-05-25', 'https://admission.ruet.ac.bd'),
      ('Medical Admission Test 2026', 'DGHS', 'Combined medical admission test for MBBS/BDS courses', '2025-12-01', '2025-12-31', '2026-02-10', 'http://dgsh.teletalk.com.bd'),
      ('CUET Admission 2026', 'CUET', 'Applications for Engineering programs', '2026-03-15', '2026-04-15', '2026-05-25', 'https://cuet.ac.bd/admission'),
      ('KUET Admission Circular', 'KUET', 'Admission notice for undergraduate programs', '2026-03-10', '2026-04-10', '2026-05-25', 'https://admission.kuet.ac.bd')
    `);
  }

  // Insert sample questions
  const questionsCount = await db.get('SELECT COUNT(*) as count FROM question_banks');
  if (questionsCount.count === 0) {
    await db.run(`
      INSERT INTO question_banks (university, subject, year, question_text, options, correct_answer) VALUES 
      ('BUET', 'Mathematics', 2024, 'If x + 1/x = 3, then find the value of x² + 1/x²', '{"A":"7","B":"8","C":"9","D":"10"}', 'A'),
      ('BUET', 'Physics', 2024, 'What is the SI unit of force?', '{"A":"Joule","B":"Newton","C":"Watt","D":"Pascal"}', 'B'),
      ('BUET', 'Chemistry', 2024, 'What is the atomic number of Carbon?', '{"A":"4","B":"5","C":"6","D":"7"}', 'C'),
      ('DU', 'Mathematics', 2024, 'What is the derivative of sin x?', '{"A":"cos x","B":"-cos x","C":"sin x","D":"-sin x"}', 'A'),
      ('DU', 'Physics', 2024, 'What is the speed of light in vacuum?', '{"A":"3×10⁵ km/s","B":"3×10⁸ m/s","C":"3×10⁶ m/s","D":"3×10⁷ m/s"}', 'B'),
      ('Medical', 'Biology', 2024, 'Which organ produces insulin?', '{"A":"Liver","B":"Pancreas","C":"Kidney","D":"Heart"}', 'B')
    `);
  }

  // Create default admin user
  const adminExists = await db.get('SELECT * FROM users WHERE email = ?', ['admin@path2uni.com']);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', BCRYPT_ROUNDS);
    await db.run(
      'INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin@path2uni.com', hashedPassword, 1]
    );
    console.log('Default admin created: admin@path2uni.com / admin123');
  }

  console.log('Database initialized successfully');
  return db;
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Authentication middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const session = await db.get(
      'SELECT * FROM sessions WHERE token = ? AND user_id = ?',
      [token, decoded.userId]
    );
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      await db.run('DELETE FROM sessions WHERE token = ?', [token]);
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token.' });
  }
}

function isAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, hscRoll, hscGroup, sscGpa, hscGpa, biologyGpa, sscYear, hscYear, phone, district } = req.body;

  try {
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await db.run(
      `INSERT INTO users (name, email, password, hsc_roll, hsc_group, ssc_gpa, hsc_gpa, biology_gpa, ssc_year, hsc_year, phone, district) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, hscRoll, hscGroup, sscGpa, hscGpa, biologyGpa, sscYear, hscYear, phone, district]
    );

    const token = jwt.sign(
      { userId: result.lastID, email, name, isAdmin: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.run(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [result.lastID, token, expiresAt.toISOString()]
    );

    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [result.lastID]);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: result.lastID, name, email, isAdmin: false }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, isAdmin: user.is_admin === 1 },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.run(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt.toISOString()]
    );

    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isAdmin: user.is_admin === 1,
        sscGpa: user.ssc_gpa,
        hscGpa: user.hsc_gpa,
        biologyGpa: user.biology_gpa
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(400).json({ error: 'No token provided' });
  }
  try {
    await db.run('DELETE FROM sessions WHERE token = ?', [token]);
    res.json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(
      `SELECT id, name, email, hsc_roll, hsc_group, ssc_gpa, hsc_gpa, biology_gpa, ssc_year, hsc_year, phone, district, avatar, is_admin, created_at, last_login 
       FROM users WHERE id = ?`,
      [req.user.userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const { name, phone, district, sscGpa, hscGpa, biologyGpa, sscYear, hscYear, hscGroup, avatar } = req.body;
  
  try {
    await db.run(
      `UPDATE users SET 
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        district = COALESCE(?, district),
        ssc_gpa = COALESCE(?, ssc_gpa),
        hsc_gpa = COALESCE(?, hsc_gpa),
        biology_gpa = COALESCE(?, biology_gpa),
        ssc_year = COALESCE(?, ssc_year),
        hsc_year = COALESCE(?, hsc_year),
        hsc_group = COALESCE(?, hsc_group),
        avatar = COALESCE(?, avatar),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, phone, district, sscGpa, hscGpa, biologyGpa, sscYear, hscYear, hscGroup, avatar, req.user.userId]
    );
    
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DASHBOARD ROUTES ====================

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    // Get user eligibility
    const eligibility = await db.get(
      'SELECT * FROM user_eligibility WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [req.user.userId]
    );
    
    // Get user applications
    const applications = await db.all(
      'SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    
    // Get active circulars
    const circulars = await db.all(
      `SELECT * FROM circulars WHERE is_active = 1 AND application_deadline >= date('now') 
       ORDER BY application_deadline ASC LIMIT 10`
    );
    
    // Get upcoming exam
    const nextExam = await db.get(
      `SELECT * FROM circulars WHERE exam_date >= date('now') 
       ORDER BY exam_date ASC LIMIT 1`
    );
    
    // Get unread notifications
    const notifications = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 10',
      [req.user.userId]
    );
    
    // Get eligible universities based on user's GPA
    const user = await db.get('SELECT ssc_gpa, hsc_gpa, biology_gpa FROM users WHERE id = ?', [req.user.userId]);
    let eligibleUniversities = [];
    
    if (user && user.ssc_gpa && user.hsc_gpa) {
      const combinedGpa = user.ssc_gpa + user.hsc_gpa;
      eligibleUniversities = await db.all(
        `SELECT * FROM universities WHERE 
         min_ssc_gpa <= ? AND min_hsc_gpa <= ? AND min_combined_gpa <= ?`,
        [user.ssc_gpa, user.hsc_gpa, combinedGpa]
      );
    }
    
    res.json({
      eligibility,
      applications: applications || [],
      circulars: circulars || [],
      nextExam,
      notifications: notifications || [],
      eligibleUniversities: eligibleUniversities || [],
      user
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ELIGIBILITY ROUTES ====================

app.post('/api/eligibility/calculate', authenticateToken, async (req, res) => {
  const { sscGpa, hscGpa, biologyGpa } = req.body;
  
  try {
    // Update user's GPA
    await db.run(
      'UPDATE users SET ssc_gpa = ?, hsc_gpa = ?, biology_gpa = ? WHERE id = ?',
      [sscGpa, hscGpa, biologyGpa, req.user.userId]
    );
    
    const combinedGpa = sscGpa + hscGpa;
    
    // Get eligible universities
    let query = `SELECT * FROM universities WHERE min_ssc_gpa <= ? AND min_hsc_gpa <= ? AND min_combined_gpa <= ?`;
    const params = [sscGpa, hscGpa, combinedGpa];
    
    if (biologyGpa) {
      query += ` AND (min_biology_gpa IS NULL OR min_biology_gpa <= ?)`;
      params.push(biologyGpa);
    }
    
    const eligibleUniversities = await db.all(query, params);
    
    // Calculate total score (SSC×8 + HSC×12 + optional bonus)
    const sscContribution = sscGpa * 8;
    const hscContribution = hscGpa * 12;
    let totalScore = sscContribution + hscContribution;
    
    if (biologyGpa) {
      totalScore += biologyGpa * 2;
    }
    
    // Save eligibility
    const existing = await db.get('SELECT id FROM user_eligibility WHERE user_id = ?', [req.user.userId]);
    
    if (existing) {
      await db.run(
        `UPDATE user_eligibility 
         SET ssc_gpa = ?, hsc_gpa = ?, biology_gpa = ?, combined_gpa = ?, 
             total_score = ?, eligible_universities = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [sscGpa, hscGpa, biologyGpa, combinedGpa, totalScore, JSON.stringify(eligibleUniversities), req.user.userId]
      );
    } else {
      await db.run(
        `INSERT INTO user_eligibility (user_id, ssc_gpa, hsc_gpa, biology_gpa, combined_gpa, total_score, eligible_universities)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.userId, sscGpa, hscGpa, biologyGpa, combinedGpa, totalScore, JSON.stringify(eligibleUniversities)]
      );
    }
    
    // Create notification
    await db.run(
      `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [req.user.userId, 'Eligibility Calculated', `You are eligible for ${eligibleUniversities.length} universities!`, 'success']
    );
    
    res.json({
      message: 'Eligibility calculated successfully',
      eligibleUniversities,
      totalScore: totalScore.toFixed(2),
      combinedGpa: combinedGpa.toFixed(2)
    });
  } catch (error) {
    console.error('Eligibility calculation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/eligibility/my', authenticateToken, async (req, res) => {
  try {
    const eligibility = await db.get(
      'SELECT * FROM user_eligibility WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [req.user.userId]
    );
    
    const user = await db.get('SELECT ssc_gpa, hsc_gpa, biology_gpa FROM users WHERE id = ?', [req.user.userId]);
    
    res.json({ eligibility, user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== APPLICATION ROUTES ====================

app.post('/api/applications', authenticateToken, async (req, res) => {
  const { universityName, unitName, applicationDate, examDate } = req.body;
  
  try {
    const result = await db.run(
      `INSERT INTO applications (user_id, university_name, unit_name, application_date, exam_date)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.userId, universityName, unitName, applicationDate, examDate]
    );
    
    // Create notification
    await db.run(
      `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [req.user.userId, 'Application Submitted', `Your application for ${universityName} has been submitted successfully!`, 'success']
    );
    
    res.json({ message: 'Application saved successfully', id: result.lastID });
  } catch (error) {
    console.error('Save application error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/applications/my', authenticateToken, async (req, res) => {
  try {
    const applications = await db.all(
      `SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.userId]
    );
    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/applications/:id/status', authenticateToken, async (req, res) => {
  const { status, paymentStatus, admitCardReady } = req.body;
  const applicationId = req.params.id;
  
  try {
    await db.run(
      `UPDATE applications SET status = ?, payment_status = ?, admit_card_ready = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [status, paymentStatus, admitCardReady ? 1 : 0, applicationId, req.user.userId]
    );
    
    res.json({ message: 'Application status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== STUDY TRACKER ROUTES ====================

app.post('/api/study/session', authenticateToken, async (req, res) => {
  const { subject, duration, date } = req.body;
  
  try {
    const result = await db.run(
      `INSERT INTO study_sessions (user_id, subject, duration, date, completed)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.userId, subject, duration, date, 0]
    );
    
    res.json({ message: 'Study session added', id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/study/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await db.all(
      `SELECT * FROM study_sessions WHERE user_id = ? ORDER BY date DESC LIMIT 30`,
      [req.user.userId]
    );
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/study/session/:id/complete', authenticateToken, async (req, res) => {
  const sessionId = req.params.id;
  
  try {
    await db.run(
      `UPDATE study_sessions SET completed = 1 WHERE id = ? AND user_id = ?`,
      [sessionId, req.user.userId]
    );
    res.json({ message: 'Session marked as completed' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CIRCULAR ROUTES ====================

app.get('/api/circulars', async (req, res) => {
  try {
    const circulars = await db.all(
      `SELECT * FROM circulars WHERE is_active = 1 ORDER BY application_deadline ASC`
    );
    res.json({ circulars });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/circulars/active', async (req, res) => {
  try {
    const circulars = await db.all(
      `SELECT * FROM circulars WHERE is_active = 1 AND application_deadline >= date('now') 
       ORDER BY application_deadline ASC`
    );
    res.json({ circulars });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== QUESTION BANK ROUTES ====================

app.get('/api/questions', async (req, res) => {
  const { university, subject } = req.query;
  
  try {
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
    
    query += ' ORDER BY year DESC';
    
    const questions = await db.all(query, params);
    res.json({ questions });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/questions/submit', authenticateToken, async (req, res) => {
  const { questionId, answer } = req.body;
  
  try {
    const question = await db.get('SELECT * FROM question_banks WHERE id = ?', [questionId]);
    const isCorrect = question.correct_answer === answer;
    
    res.json({ isCorrect, correctAnswer: question.correct_answer });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== NOTIFICATION ROUTES ====================

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await db.all(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.user.userId]
    );
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await db.run(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.userId]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UNIVERSITIES ROUTES ====================

app.get('/api/universities', async (req, res) => {
  try {
    const universities = await db.all('SELECT * FROM universities ORDER BY name');
    res.json({ universities });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/universities/:category', async (req, res) => {
  const { category } = req.params;
  
  try {
    const universities = await db.all(
      'SELECT * FROM universities WHERE category = ? ORDER BY name',
      [category]
    );
    res.json({ universities });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== EMAIL NOTIFICATION ROUTE ====================

app.post('/api/notify/send', authenticateToken, async (req, res) => {
  const { email, subject, message } = req.body;
  
  try {
    // Save notification to database
    await db.run(
      `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [req.user.userId, subject, message, 'email']
    );
    
    // In production, send actual email
    // await transporter.sendMail({
    //   from: process.env.EMAIL_USER,
    //   to: email,
    //   subject: subject,
    //   html: message
    // });
    
    res.json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ADMIN ROUTES ====================

app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await db.all(
      `SELECT id, name, email, is_admin, created_at, last_login FROM users ORDER BY created_at DESC`
    );
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/circulars', authenticateToken, isAdmin, async (req, res) => {
  const { title, university, description, applicationStart, applicationDeadline, examDate, link } = req.body;
  
  try {
    await db.run(
      `INSERT INTO circulars (title, university, description, application_start, application_deadline, exam_date, link)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, university, description, applicationStart, applicationDeadline, examDate, link]
    );
    res.json({ message: 'Circular added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/questions', authenticateToken, isAdmin, async (req, res) => {
  const { university, subject, year, questionText, options, correctAnswer } = req.body;
  
  try {
    await db.run(
      `INSERT INTO question_banks (university, subject, year, question_text, options, correct_answer)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [university, subject, year, questionText, JSON.stringify(options), correctAnswer]
    );
    res.json({ message: 'Question added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check deadlines and send notifications (run every hour)
async function checkDeadlines() {
  try {
    const upcomingCirculars = await db.all(
      `SELECT * FROM circulars WHERE application_deadline BETWEEN date('now') AND date('now', '+7 days')`
    );
    
    for (const circular of upcomingCirculars) {
      const users = await db.all('SELECT id, email FROM users');
      for (const user of users) {
        const existingNotif = await db.get(
          'SELECT id FROM notifications WHERE user_id = ? AND title LIKE ? AND date(created_at) = date("now")',
          [user.id, `%${circular.title}%`]
        );
        
        if (!existingNotif) {
          await db.run(
            `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
            [user.id, ` Deadline Approaching: ${circular.title}`, `Application deadline for ${circular.university} is on ${circular.application_deadline}. Apply now!`, 'deadline']
          );
        }
      }
    }
  } catch (error) {
    console.error('Deadline check error:', error);
  }
}

// Run deadline check every hour
setInterval(checkDeadlines, 3600000);

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(` Server running on http://localhost:${PORT}`);
      console.log(` API endpoints ready`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
