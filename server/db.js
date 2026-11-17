const mysql = require('mysql2/promise');
const { openSqlite } = require('./sqlite-open');
const path = require('path');
const fs = require('fs');
const { hashPassword, verifyPassword } = require('./security');

let dbType = 'sqlite'; // 'mysql' or 'sqlite'
let mysqlPool = null;
let sqliteDb = null;

const DEFAULT_GIFTS = [
  { id: 1, name: 'ውዳሴ ማርያም', description: 'The holy and blessed book of Wudase Mariam prayers and praises.', image_url: '/images/gifts/wudase-mariam.png' },
  { id: 2, name: 'Chocolate', description: 'Delicious Milka Oreo Alpine milk chocolate treats!', image_url: '/images/gifts/milka-oreo.jpg' },
  { id: 3, name: 'Cute Bracelet', description: 'Charming handcrafted beaded flower bracelet.', image_url: '/images/gifts/pink-bracelet.jpg' },
  { id: 4, name: 'የእመቤታችን ስዕል አድኖ', description: 'Blessed Virgin Mary traditional Ethiopian Orthodox sacred icon.', image_url: '/images/gifts/mariam-icon.jpg' },
  { id: 5, name: 'Invite Me Out for Tea and እርጥብ', description: 'A special warm outing for cozy hot tea and delicious traditional ertib!', image_url: '/images/gifts/tea-ertib.jpg' },
  { id: 6, name: 'Flower Hair Clip', description: 'Delicate and cute pink floral aesthetic hair accessory.', image_url: '/images/gifts/flower-hair-clip.jpg' },
  { id: 7, name: 'Socks', description: 'Super soft, warm and cute cozy patterned socks.', image_url: '/images/gifts/socks.svg' },
  { id: 8, name: 'Daily Data Package', description: 'High-speed daily mobile data package for unlimited connection.', image_url: '/images/gifts/daily-data.svg' },
  { id: 9, name: 'Meskel', description: 'Exquisite Ethiopian traditional engraved cross pendant.', image_url: '/images/gifts/meskel-cross.jpg' },
  { id: 10, name: 'Invite Me to Mezmur', description: 'A beautiful spiritual invitation to attend uplifting mezmur worship.', image_url: '/images/gifts/invite-mezmur.svg' }
];

const DEFAULT_GALLERY = [
  { image_url: '/images/gallery/nanati-1.jpg', description: 'Radiant smile and gorgeous curls ✨', sort_order: 1 },
  { image_url: '/images/gallery/nanati-2.jpg', description: 'Cherishing memories that warm the heart ❤️', sort_order: 2 },
  { image_url: '/images/gallery/nanati-3.jpg', description: 'Birthday glow with my favorite cake 🎂', sort_order: 3 },
  { image_url: '/images/gallery/nanati-4.jpg', description: 'Another chapter of grace, elegance, and laughter 🌸', sort_order: 4 }
];

const MYSQL_DB = (process.env.MYSQL_DATABASE || 'nanati_birthday').replace(/[^a-zA-Z0-9_]/g, '');
const FALLBACK_ADMIN_PASS = 'nanati2026';

function adminSeed() {
  return {
    user: (process.env.ADMIN_DEFAULT_USER || 'nanati').trim(),
    pass: process.env.ADMIN_DEFAULT_PASS || FALLBACK_ADMIN_PASS
  };
}

// Warn loudly if the well-known default password is still active
async function warnIfDefaultPassword() {
  try {
    const rows = await all('SELECT username, password FROM admin_users');
    if (rows.some(r => verifyPassword(FALLBACK_ADMIN_PASS, r.password))) {
      console.log('⚠️  The admin account still uses the default password.');
      console.log('   Log in and change it (Overview tab) before sharing the site publicly!');
    }
  } catch (e) { /* ignore */ }
}

async function initDB() {
  // First attempt: Try connecting to MySQL Server
  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      connectTimeout: 2000
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.end();

    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: MYSQL_DB,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Create MySQL tables
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS gifts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(500) NOT NULL,
        is_enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        session_id VARCHAR(100) UNIQUE,
        assigned_gift_id INT,
        game_completed TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        participant_id INT NULL,
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        gift_id INT NULL,
        is_liked TINYINT(1) DEFAULT 0,
        admin_reply TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS gallery (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image_url VARCHAR(500) NOT NULL,
        description VARCHAR(500) NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kind VARCHAR(20) NOT NULL,
        url VARCHAR(500) NOT NULL,
        title VARCHAR(200) NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check seed gifts
    const [gifts] = await mysqlPool.query('SELECT COUNT(*) as cnt FROM gifts');
    if (gifts[0].cnt === 0) {
      for (const g of DEFAULT_GIFTS) {
        await mysqlPool.query('INSERT INTO gifts (id, name, description, image_url, is_enabled) VALUES (?, ?, ?, ?, 1)', [g.id, g.name, g.description, g.image_url]);
      }
    }

    const [gal] = await mysqlPool.query('SELECT COUNT(*) as cnt FROM gallery');
    if (gal[0].cnt === 0) {
      for (const p of DEFAULT_GALLERY) {
        await mysqlPool.query('INSERT INTO gallery (image_url, description, sort_order) VALUES (?, ?, ?)', [p.image_url, p.description, p.sort_order]);
      }
    }

    const [admin] = await mysqlPool.query('SELECT COUNT(*) as cnt FROM admin_users');
    if (admin[0].cnt === 0) {
      const a = adminSeed();
      await mysqlPool.query('INSERT INTO admin_users (username, password) VALUES (?, ?)', [a.user, hashPassword(a.pass)]);
    }

    dbType = 'mysql';
    console.log(`✅ Connected successfully to MySQL database (${MYSQL_DB})!`);
    await warnIfDefaultPassword();
    return;
  } catch (err) {
    console.log('ℹ️ MySQL not active or credentials unavailable. Utilizing high-performance SQLite relational database.');
  }

  // SQLite Relational Database setup
  const dbPath = path.join(__dirname, 'nanati_birthday.db');
  const opened = await openSqlite(dbPath);
  sqliteDb = opened.db;

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      session_id TEXT UNIQUE,
      assigned_gift_id INTEGER,
      game_completed INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_gift_id) REFERENCES gifts(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      gift_id INTEGER,
      is_liked INTEGER DEFAULT 0,
      admin_reply TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (participant_id) REFERENCES participants(id),
      FOREIGN KEY (gift_id) REFERENCES gifts(id)
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default gifts if empty
  const giftCount = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM gifts').get().cnt;
  if (giftCount === 0) {
    const insertGift = sqliteDb.prepare('INSERT INTO gifts (id, name, description, image_url, is_enabled) VALUES (?, ?, ?, ?, 1)');
    for (const g of DEFAULT_GIFTS) {
      insertGift.run(g.id, g.name, g.description, g.image_url);
    }
  }

  // Seed default gallery if empty
  const galCount = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM gallery').get().cnt;
  if (galCount === 0) {
    const insertGal = sqliteDb.prepare('INSERT INTO gallery (image_url, description, sort_order) VALUES (?, ?, ?)');
    for (const p of DEFAULT_GALLERY) {
      insertGal.run(p.image_url, p.description, p.sort_order);
    }
  }

  // Seed admin user
  const adminCount = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM admin_users').get().cnt;
  if (adminCount === 0) {
    const a = adminSeed();
    sqliteDb.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run(a.user, hashPassword(a.pass));
  }

  dbType = 'sqlite';
  console.log(`✅ SQLite database ready (${opened.engine}):`, dbPath);
  await warnIfDefaultPassword();
}

// Unified Query interface (undefined params become NULL so SQLite never throws)
const clean = (params) => params.map(p => (p === undefined ? null : p));

async function all(sql, params = []) {
  if (dbType === 'mysql') {
    const [rows] = await mysqlPool.execute(sql, clean(params));
    return rows;
  } else {
    return sqliteDb.prepare(sql).all(...clean(params));
  }
}

async function get(sql, params = []) {
  if (dbType === 'mysql') {
    const [rows] = await mysqlPool.execute(sql, clean(params));
    return rows[0] || null;
  } else {
    return sqliteDb.prepare(sql).get(...clean(params)) || null;
  }
}

async function run(sql, params = []) {
  if (dbType === 'mysql') {
    const [result] = await mysqlPool.execute(sql, clean(params));
    return { lastID: result.insertId, changes: result.affectedRows };
  } else {
    const stmt = sqliteDb.prepare(sql);
    const result = stmt.run(...clean(params));
    return { lastID: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }
}

module.exports = {
  initDB,
  all,
  get,
  run,
  getDBType: () => dbType
};
