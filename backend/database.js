const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

let db;

async function initializeDatabase() {
  db = await sqlite.open({
    filename: path.join(__dirname, 'path2uni.db'),
    driver: sqlite3.Database
  });

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
      ssc_year INTEGER,
      hsc_year INTEGER,
      phone TEXT,
      district TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

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

  await db.exec(`
    CREATE TABLE IF NOT EXISTS saved_eligibility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      ssc_gpa REAL,
      hsc_gpa REAL,
      biology_gpa REAL,
      combined_gpa REAL,
      total_score REAL,
      eligible INTEGER DEFAULT 0,
      is_cross_group INTEGER DEFAULT 0,
      university_name TEXT,
      unit_name TEXT,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      university_name TEXT NOT NULL,
      unit_name TEXT,
      application_date DATE,
      status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'pending',
      admit_card_ready INTEGER DEFAULT 0,
      exam_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      date DATE,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users (id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS universities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT,
      est_year INTEGER,
      location TEXT,
      type TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const defaultUniversities = [
    { name: 'Bangladesh University of Engineering and Technology', short_name: 'BUET', est_year: 1912, location: 'Dhaka', type: 'engineering' },
    { name: 'University of Dhaka', short_name: 'DU', est_year: 1921, location: 'Dhaka', type: 'general' },
    { name: 'Rajshahi University of Engineering and Technology', short_name: 'RUET', est_year: 1964, location: 'Rajshahi', type: 'engineering' }
  ];

  for (const uni of defaultUniversities) {
    const exists = await db.get('SELECT * FROM universities WHERE short_name = ?', [uni.short_name]);
    if (!exists) {
      await db.run(
        'INSERT INTO universities (name, short_name, est_year, location, type) VALUES (?, ?, ?, ?, ?)',
        [uni.name, uni.short_name, uni.est_year, uni.location, uni.type]
      );
    }
  }

  const adminExists = await db.get('SELECT * FROM users WHERE email = ?', ['admin@path2uni.com']);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run(
      'INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin@path2uni.com', hashedPassword, 1]
    );
    console.log('Default admin created: admin@path2uni.com / admin123');
  }

  console.log('Database initialized successfully');
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

module.exports = { initializeDatabase, getDb };
