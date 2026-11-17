// Friendly message if Node.js is too old (the window would otherwise just close)
if (parseInt(process.versions.node, 10) < 18) {
  console.error('\n❌ Your Node.js is version ' + process.versions.node + ' - this site needs Node.js 18 or newer.');
  console.error('   Please install the LTS version from https://nodejs.org and run start.bat again.\n');
  process.exit(1);
}

// Load .env (Node 20.12+; skipped silently on older versions). Silently continue if there is no .env file.
try { process.loadEnvFile(require('path').join(__dirname, '../.env')); } catch (e) { /* no .env - use defaults */ }

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const security = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- LIMITS ----------------
const MAX_NAME_LEN = 50;
const MAX_MESSAGE_LEN = 1000;
const MAX_REPLY_LEN = 1000;
const MAX_CAPTION_LEN = 200;

app.disable('x-powered-by');
// Behind a hosting proxy (Render, Railway, nginx...)? Set TRUST_PROXY=1 in .env so
// rate limits see each guest's real IP instead of the proxy's.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY));
}
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Stop browsers from "guessing" file types (defence in depth for uploads)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// ---------------- IMAGE UPLOADS (images only, 8 MB max) ----------------
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Extension comes from the verified MIME type, never from the user's file name
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype] || '.jpg';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'photo-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed.'));
  }
});

// ---------------- VIDEO / MUSIC / VOICE UPLOADS ----------------
const MEDIA_TYPES = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
  'audio/aac': '.aac', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.webm'
};
const MEDIA_KINDS = ['video', 'music', 'voice'];
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // short videos
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const baseMime = (m) => String(m || '').split(';')[0].trim().toLowerCase();

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR); },
    filename: (req, file, cb) => {
      const ext = MEDIA_TYPES[baseMime(file.mimetype)] || '.bin';
      cb(null, 'media-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (MEDIA_TYPES[baseMime(file.mimetype)]) return cb(null, true);
    cb(new Error('Only MP4 / WEBM / MOV videos or MP3 / M4A / WAV / OGG audio are allowed.'));
  }
});

// Delete an uploaded file from disk (only ever inside the uploads folder)
function removeUploadedFile(url) {
  try {
    if (!url || !url.startsWith('/uploads/')) return;
    const file = path.join(UPLOAD_DIR, path.basename(url));
    if (file.startsWith(UPLOAD_DIR) && fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) { /* ignore */ }
}

// ---------------- ADMIN AUTH ----------------
function getToken(req) {
  return req.headers['authorization'] || null;
}

function requireAdmin(req, res, next) {
  const session = security.getSession(getToken(req));
  if (session) {
    req.admin = session;
    return next();
  }
  res.status(401).json({ error: 'Unauthorized: Nanati Admin Access Only' });
}

// Max 8 login attempts per IP per 15 minutes
const loginLimiter = security.rateLimiter(8, 15 * 60 * 1000, 'Too many login attempts. Please wait a few minutes and try again.');
// Guests: generous limits (friends often share one Wi-Fi / campus IP), just enough to stop floods
const TEN_MIN = 10 * 60 * 1000;
const tooFast = 'Lots of people are celebrating at once! Please wait a few minutes and try again 😊';
const joinLimiter = security.rateLimiter(60, TEN_MIN, tooFast);
const playLimiter = security.rateLimiter(90, TEN_MIN, tooFast);
const wishLimiter = security.rateLimiter(40, TEN_MIN, tooFast);

// Helpers
const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

// ---------------- API ROUTES ----------------

// System Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    dbType: db.getDBType(),
    time: new Date().toISOString()
  });
});

// Admin Auth
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const username = cleanText(req.body && req.body.username, 100);
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [username]);
    if (user && security.verifyPassword(password, user.password)) {
      // Upgrade any legacy plain-text password to a hash on first successful login
      if (!security.isHashed(user.password)) {
        await db.run('UPDATE admin_users SET password = ? WHERE id = ?', [security.hashPassword(password), user.id]);
      }
      const token = security.createSession(user.username);
      return res.json({ success: true, token, username: user.username });
    }
    res.status(401).json({ error: 'Invalid birthday admin credentials' });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: Boolean(security.getSession(getToken(req))) });
});

app.post('/api/admin/logout', (req, res) => {
  security.destroySession(getToken(req));
  res.json({ success: true });
});

app.post('/api/admin/password', requireAdmin, loginLimiter, async (req, res) => {
  try {
    const current = req.body && typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const next = req.body && typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    if (next.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [req.admin.username]);
    if (!user || !security.verifyPassword(current, user.password)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    await db.run('UPDATE admin_users SET password = ? WHERE id = ?', [security.hashPassword(next), user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- GIFTS ----------------
app.get('/api/gifts', async (req, res) => {
  try {
    const onlyActive = req.query.active === 'true';
    const sql = onlyActive ? 'SELECT * FROM gifts WHERE is_enabled = 1 ORDER BY id ASC' : 'SELECT * FROM gifts ORDER BY id ASC';
    const gifts = await db.all(sql);
    res.json(gifts);
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gifts', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const name = cleanText(req.body.name, 120);
    const description = cleanText(req.body.description, 300);
    let image_url = null;
    if (req.file) image_url = '/uploads/' + req.file.filename;

    if (!name || !image_url) {
      return res.status(400).json({ error: 'Name and image are required' });
    }

    const result = await db.run(
      'INSERT INTO gifts (name, description, image_url, is_enabled) VALUES (?, ?, ?, 1)',
      [name, description, image_url]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/gifts/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const name = cleanText(req.body.name, 120);
    const description = cleanText(req.body.description, 300);
    if (!name) return res.status(400).json({ error: 'Gift name is required' });

    if (req.file) {
      await db.run('UPDATE gifts SET name = ?, description = ?, image_url = ? WHERE id = ?', [name, description, '/uploads/' + req.file.filename, id]);
    } else {
      await db.run('UPDATE gifts SET name = ?, description = ? WHERE id = ?', [name, description, id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/gifts/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const gift = await db.get('SELECT is_enabled FROM gifts WHERE id = ?', [id]);
    if (!gift) return res.status(404).json({ error: 'Gift not found' });
    const newStatus = gift.is_enabled ? 0 : 1;
    await db.run('UPDATE gifts SET is_enabled = ? WHERE id = ?', [newStatus, id]);
    res.json({ success: true, is_enabled: newStatus });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gifts/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Protect guests' records: a gift someone already received should be disabled, not deleted
    // (unless Nanati explicitly forces it with ?force=true)
    if (req.query.force !== 'true') {
      const used = (await db.get('SELECT COUNT(*) as count FROM participants WHERE assigned_gift_id = ?', [id])).count;
      if (used > 0) {
        return res.status(409).json({
          error: `${used} guest(s) already received this gift. Disabling it is safer than deleting it.`,
          assignedCount: used
        });
      }
    }
    // Detach records that point at this gift first (guests may replay; their old wishes lose the gift badge)
    await db.run('UPDATE messages SET gift_id = NULL WHERE gift_id = ?', [id]);
    await db.run('UPDATE participants SET assigned_gift_id = NULL, game_completed = 0 WHERE assigned_gift_id = ?', [id]);
    const old = await db.get('SELECT image_url FROM gifts WHERE id = ?', [id]);
    await db.run('DELETE FROM gifts WHERE id = ?', [id]);
    if (old) removeUploadedFile(old.image_url);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- GAME & PARTICIPANTS ----------------
app.post('/api/participants/join', joinLimiter, async (req, res) => {
  try {
    const cleanName = cleanText(req.body.name, MAX_NAME_LEN);
    const sessionId = cleanText(req.body.sessionId, 100);
    if (!cleanName) {
      return res.status(400).json({ error: 'Please enter your name' });
    }

    let participant = null;
    if (sessionId) {
      participant = await db.get('SELECT * FROM participants WHERE session_id = ?', [sessionId]);
    }

    if (!participant) {
      const generatedSession = sessionId || 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2);
      const result = await db.run(
        'INSERT INTO participants (name, session_id, game_completed) VALUES (?, ?, 0)',
        [cleanName, generatedSession]
      );
      participant = await db.get('SELECT * FROM participants WHERE id = ?', [result.lastID]);
    } else {
      await db.run('UPDATE participants SET name = ? WHERE id = ?', [cleanName, participant.id]);
      participant.name = cleanName;
    }

    // If they already played, hand back their gift so the page can restore it
    let gift = null;
    if (participant.assigned_gift_id) {
      gift = await db.get('SELECT * FROM gifts WHERE id = ?', [participant.assigned_gift_id]);
    }

    res.json({ ...participant, gift });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// Restore a returning visitor (same browser) without asking for their name again
app.get('/api/participants/me', async (req, res) => {
  try {
    const sessionId = cleanText(req.query.sessionId, 100);
    if (!sessionId) return res.json({ participant: null });
    const participant = await db.get('SELECT * FROM participants WHERE session_id = ?', [sessionId]);
    if (!participant) return res.json({ participant: null });

    let gift = null;
    if (participant.assigned_gift_id) {
      gift = await db.get('SELECT * FROM gifts WHERE id = ?', [participant.assigned_gift_id]);
    }
    res.json({ participant, gift });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/game/assign-gift', playLimiter, async (req, res) => {
  try {
    const sessionId = cleanText(req.body.sessionId, 100);
    if (!sessionId) {
      return res.status(400).json({ error: 'Participant identification required' });
    }

    // Only people who joined (entered their name) can play
    let participant = await db.get('SELECT * FROM participants WHERE session_id = ?', [sessionId]);
    if (!participant) {
      return res.status(404).json({ error: 'Please enter your name to join the celebration first.' });
    }

    // Rule: a participant's assigned gift never changes after the game
    if (participant.assigned_gift_id) {
      const gift = await db.get('SELECT * FROM gifts WHERE id = ?', [participant.assigned_gift_id]);
      if (gift) return res.json({ participant, gift, alreadyAssigned: true });
    }

    const availableGifts = await db.all('SELECT * FROM gifts WHERE is_enabled = 1');
    if (availableGifts.length === 0) {
      return res.status(400).json({ error: 'All birthday gifts have currently been claimed! Check back soon or message Nanati.' });
    }

    // Count how often each gift was already given, to spread them out evenly
    const assignedRows = await db.all('SELECT assigned_gift_id FROM participants WHERE assigned_gift_id IS NOT NULL');
    const assignedCounts = {};
    for (const row of assignedRows) {
      assignedCounts[row.assigned_gift_id] = (assignedCounts[row.assigned_gift_id] || 0) + 1;
    }

    const minCount = Math.min(...availableGifts.map(g => assignedCounts[g.id] || 0));
    const candidates = availableGifts.filter(g => (assignedCounts[g.id] || 0) === minCount);
    const chosenGift = candidates[Math.floor(Math.random() * candidates.length)];

    // Guarded update: if two requests race, only the first one wins
    const update = await db.run(
      'UPDATE participants SET assigned_gift_id = ?, game_completed = 1 WHERE id = ? AND assigned_gift_id IS NULL',
      [chosenGift.id, participant.id]
    );

    if (update.changes === 0) {
      participant = await db.get('SELECT * FROM participants WHERE id = ?', [participant.id]);
      const existing = await db.get('SELECT * FROM gifts WHERE id = ?', [participant.assigned_gift_id]);
      return res.json({ participant, gift: existing, alreadyAssigned: true });
    }

    participant = await db.get('SELECT * FROM participants WHERE id = ?', [participant.id]);
    res.json({ participant, gift: chosenGift });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/participants', requireAdmin, async (req, res) => {
  try {
    const list = await db.all(`
      SELECT p.*, g.name as gift_name, g.image_url as gift_image,
        (SELECT COUNT(*) FROM messages m WHERE m.participant_id = p.id) AS wish_count
      FROM participants p
      LEFT JOIN gifts g ON p.assigned_gift_id = g.id
      ORDER BY p.id DESC
    `);
    res.json(list);
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- BIRTHDAY MESSAGES ----------------
const MESSAGE_SELECT = `
  SELECT m.*, g.name as gift_name, g.image_url as gift_image, g.description as gift_description
  FROM messages m
  LEFT JOIN gifts g ON m.gift_id = g.id
`;

app.get('/api/messages', async (req, res) => {
  try {
    const messages = await db.all(`${MESSAGE_SELECT} ORDER BY m.id DESC`);
    res.json(messages);
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages', wishLimiter, async (req, res) => {
  try {
    const name = cleanText(req.body.name, MAX_NAME_LEN);
    const content = cleanText(req.body.content, MAX_MESSAGE_LEN);
    const sessionId = cleanText(req.body.sessionId, 100);
    if (!name || !content) {
      return res.status(400).json({ error: 'Name and birthday wish message are required' });
    }

    // The gift on a message is ALWAYS looked up from the sender's own game result.
    // (The browser can no longer attach an arbitrary gift to a message.)
    let participantId = null;
    let giftId = null;
    if (sessionId) {
      const p = await db.get('SELECT id, assigned_gift_id FROM participants WHERE session_id = ?', [sessionId]);
      if (p) {
        participantId = p.id;
        giftId = p.assigned_gift_id || null;
      }
    }

    const result = await db.run(
      'INSERT INTO messages (participant_id, name, content, gift_id, is_liked, admin_reply) VALUES (?, ?, ?, ?, 0, NULL)',
      [participantId, name, content, giftId]
    );

    const newMessage = await db.get(`${MESSAGE_SELECT} WHERE m.id = ?`, [result.lastID]);
    res.json(newMessage);
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/messages/:id/like', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const msg = await db.get('SELECT is_liked FROM messages WHERE id = ?', [id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const newLiked = msg.is_liked ? 0 : 1;
    await db.run('UPDATE messages SET is_liked = ? WHERE id = ?', [newLiked, id]);
    res.json({ success: true, is_liked: newLiked });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/:id/reply', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const reply = cleanText(req.body.reply, MAX_REPLY_LEN) || null;
    await db.run('UPDATE messages SET admin_reply = ? WHERE id = ?', [reply, id]);
    res.json({ success: true, admin_reply: reply });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/messages/:id/reply', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('UPDATE messages SET admin_reply = NULL WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/messages/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM messages WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- GALLERY ----------------
app.get('/api/gallery', async (req, res) => {
  try {
    const photos = await db.all('SELECT * FROM gallery ORDER BY sort_order ASC, id ASC');
    res.json(photos);
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gallery', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required' });
    }
    const image_url = '/uploads/' + req.file.filename;
    const description = cleanText(req.body.description, MAX_CAPTION_LEN);

    // New photos go to the end unless an order is given
    let sortOrder = toInt(req.body.sort_order, 0);
    if (!sortOrder) {
      const max = await db.get('SELECT MAX(sort_order) as m FROM gallery');
      sortOrder = ((max && max.m) || 0) + 1;
    }

    const result = await db.run(
      'INSERT INTO gallery (image_url, description, sort_order) VALUES (?, ?, ?)',
      [image_url, description, sortOrder]
    );

    const newPhoto = await db.get('SELECT * FROM gallery WHERE id = ?', [result.lastID]);
    res.json(newPhoto);
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/gallery/:id', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const description = cleanText(req.body.description, MAX_CAPTION_LEN);
    const sortOrder = toInt(req.body.sort_order, 0);
    if (req.file) {
      const old = await db.get('SELECT image_url FROM gallery WHERE id = ?', [id]);
      await db.run('UPDATE gallery SET image_url = ?, description = ?, sort_order = ? WHERE id = ?', ['/uploads/' + req.file.filename, description, sortOrder, id]);
      if (old) removeUploadedFile(old.image_url);
    } else {
      await db.run('UPDATE gallery SET description = ?, sort_order = ? WHERE id = ?', [description, sortOrder, id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gallery/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const old = await db.get('SELECT image_url FROM gallery WHERE id = ?', [id]);
    await db.run('DELETE FROM gallery WHERE id = ?', [id]);
    if (old) removeUploadedFile(old.image_url);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- MEDIA: short videos, background music, voice messages ----------------
app.get('/api/media', async (req, res) => {
  try {
    const kind = cleanText(req.query.kind, 20);
    const rows = MEDIA_KINDS.includes(kind)
      ? await db.all('SELECT * FROM media WHERE kind = ? ORDER BY sort_order ASC, id ASC', [kind])
      : await db.all('SELECT * FROM media ORDER BY kind ASC, sort_order ASC, id ASC');
    res.json(rows);
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/media', requireAdmin, mediaUpload.single('file'), async (req, res) => {
  try {
    const kind = cleanText(req.body.kind, 20);
    if (!req.file) return res.status(400).json({ error: 'Please choose a file.' });
    const mime = baseMime(req.file.mimetype);
    const reject = (msg) => { removeUploadedFile('/uploads/' + req.file.filename); return res.status(400).json({ error: msg }); };

    if (!MEDIA_KINDS.includes(kind)) return reject('Unknown media type.');
    if (kind === 'video' && !mime.startsWith('video/')) return reject('That file is not a video.');
    if (kind !== 'video' && !mime.startsWith('audio/')) return reject('That file is not an audio file.');
    if (kind !== 'video' && req.file.size > MAX_AUDIO_BYTES) return reject('Audio is too large (max 15 MB).');

    const title = cleanText(req.body.title, 200);
    const max = await db.get('SELECT MAX(sort_order) as m FROM media WHERE kind = ?', [kind]);
    const result = await db.run(
      'INSERT INTO media (kind, url, title, sort_order) VALUES (?, ?, ?, ?)',
      [kind, '/uploads/' + req.file.filename, title, ((max && max.m) || 0) + 1]
    );
    res.json(await db.get('SELECT * FROM media WHERE id = ?', [result.lastID]));
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/media/:id', requireAdmin, async (req, res) => {
  try {
    const title = cleanText(req.body.title, 200);
    await db.run('UPDATE media SET title = ?, sort_order = ? WHERE id = ?', [title, toInt(req.body.sort_order, 0), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/media/:id', requireAdmin, async (req, res) => {
  try {
    const old = await db.get('SELECT url FROM media WHERE id = ?', [req.params.id]);
    await db.run('DELETE FROM media WHERE id = ?', [req.params.id]);
    if (old) removeUploadedFile(old.url);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- ADMIN STATS OVERVIEW ----------------
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const count = async (sql) => (await db.get(sql)).count;
    res.json({
      totalParticipants: await count('SELECT COUNT(*) as count FROM participants'),
      completedGames: await count('SELECT COUNT(*) as count FROM participants WHERE game_completed = 1'),
      totalMessages: await count('SELECT COUNT(*) as count FROM messages'),
      totalGifts: await count('SELECT COUNT(*) as count FROM gifts'),
      activeGifts: await count('SELECT COUNT(*) as count FROM gifts WHERE is_enabled = 1'),
      assignedGifts: await count('SELECT COUNT(*) as count FROM participants WHERE assigned_gift_id IS NOT NULL'),
      totalPhotos: await count('SELECT COUNT(*) as count FROM gallery'),
      totalVideos: await count("SELECT COUNT(*) as count FROM media WHERE kind = 'video'"),
      totalMusic: await count("SELECT COUNT(*) as count FROM media WHERE kind = 'music'"),
      totalVoice: await count("SELECT COUNT(*) as count FROM media WHERE kind = 'voice'"),
      likedMessages: await count('SELECT COUNT(*) as count FROM messages WHERE is_liked = 1'),
      repliedMessages: await count("SELECT COUNT(*) as count FROM messages WHERE admin_reply IS NOT NULL AND admin_reply <> ''")
    });
  } catch (err) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: err.message });
  }
});

// Unknown API routes should answer with JSON, not the homepage
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Fallback to index.html for everything else
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Friendly errors (upload problems, bad JSON, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (photos max 8 MB, videos 40 MB, audio 15 MB).' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request data' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That request is too large.' });
  }
  if (err && err.message && err.message.startsWith('Only ')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// Start Server
async function start() {
  await db.initDB();
  const server = app.listen(PORT, () => {
    console.log(`✨ Nanati Birthday Celebration Server running on http://localhost:${PORT}`);
    console.log(`   Admin page:  http://localhost:${PORT}/admin.html`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is already in use - the site may already be running in another window.`);
      console.error('   Close that window, or add PORT=3001 to a file named .env and try again.\n');
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('\n❌ The server could not start:', err && err.message ? err.message : err, '\n');
  process.exit(1);
});
