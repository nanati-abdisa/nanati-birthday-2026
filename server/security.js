const crypto = require('crypto');

// ---------------- PASSWORD HASHING (scrypt, built into Node) ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const given = String(password);

  // Legacy plain-text value (e.g. from an old schema.sql import)
  if (!stored.startsWith('scrypt$')) {
    const a = Buffer.from(given);
    const b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(given, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

// ---------------- ADMIN SESSIONS (in memory, 12h expiry) ----------------
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> { username, expires }

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function destroySession(token) {
  sessions.delete(token);
}

// ---------------- SIMPLE IN-MEMORY RATE LIMITER ----------------
// limiter(maxHits, windowMs) -> express middleware keyed by client IP
function rateLimiter(maxHits, windowMs, message) {
  const hits = new Map(); // ip -> [timestamps]

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, list] of hits) {
      const fresh = list.filter(t => t > cutoff);
      if (fresh.length) hits.set(ip, fresh); else hits.delete(ip);
    }
  }, windowMs).unref();

  return function (req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => t > now - windowMs);
    if (list.length >= maxHits) {
      return res.status(429).json({ error: message || 'Too many requests. Please slow down a little 😊' });
    }
    list.push(now);
    hits.set(ip, list);
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  isHashed,
  createSession,
  getSession,
  destroySession,
  rateLimiter
};
