require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createDB } = require('./db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const app = express();
app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
listening on ${PORT}

Example logins:  student_11а_1 / student123
        teacher_11а / teacher123
        admin / admin123
`);
    });
    
app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin) return cb(null, true);
    if (allowed.length === 0) return cb(null, true);
    return cb(null, allowed.includes(origin));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Session-Token', 'Authorization'],
}));
app.use(express.json());

const db = createDB();
const pendingTwoFactorLogins = new Map();

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function isSecureCookieRequest(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (forwardedProto) {
    return String(forwardedProto).split(',')[0].trim() === 'https';
  }
  return !!req.secure;
}

function setSessionCookie(req, res, token) {
  const isLocal = /localhost|127\.0\.0\.1/.test(req.headers.origin || '') || /localhost|127\.0\.0\.1/.test(req.headers.host || '');
  const attrs = [
    `school_session=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=2592000',
    isLocal ? 'SameSite=Lax' : 'SameSite=None'
  ];
  if (!isLocal || isSecureCookieRequest(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}


function getSessionTokenFromRequest(req) {
  const cookies = parseCookies(req);
  const cookieToken = cookies.school_session;
  const headerToken = req.headers['x-session-token'];
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  return cookieToken || headerToken || bearerToken || null;
}

function clearSessionCookie(req, res) {
  const isLocal = /localhost|127\.0\.0\.1/.test(req.headers.origin || '') || /localhost|127\.0\.0\.1/.test(req.headers.host || '');
  const attrs = [
    'school_session=',
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    isLocal ? 'SameSite=Lax' : 'SameSite=None'
  ];
  if (!isLocal || isSecureCookieRequest(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function randomBase32Secret(length = 32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function base32ToBuffer(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = String(input || '').toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  for (const ch of clean) {
    const val = alphabet.indexOf(ch);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret, timeStep = 30, digits = 6, timestampMs = Date.now()) {
  const counter = Math.floor(timestampMs / 1000 / timeStep);
  const secretBuf = base32ToBuffer(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 |
               (hmac[offset + 1] & 0xff) << 16 |
               (hmac[offset + 2] & 0xff) << 8 |
               (hmac[offset + 3] & 0xff)) % (10 ** digits);
  return String(code).padStart(digits, '0');
}

function verifyTotp(secret, code, windowSize = 1) {
  const normalized = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let offset = -windowSize; offset <= windowSize; offset++) {
    const ts = Date.now() + offset * 30000;
    if (generateTotp(secret, 30, 6, ts) === normalized) return true;
  }
  return false;
}

async function getAuthUser(req) {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;
  return db.prepare(`
    SELECT u.*, s.token as session_token, s.expires_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > NOW()
  `).get(token);
}

async function authMiddleware(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    delete user.password;
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function buildSanitizedUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password;
  delete copy.two_factor_secret;
  return copy;
}


async function initDB() {
  // UUIDs are generated by the application (uuidv4).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      class_grade TEXT,
      class_letter TEXT,
      bio TEXT,
      profile_picture TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      theme TEXT DEFAULT 'light',
      accent_color TEXT DEFAULT 'blue',
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      two_factor_secret TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token UUID UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      image_url TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      engagement_score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS likes (
      id UUID PRIMARY KEY,
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY,
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      event_date TEXT NOT NULL,
      event_time TEXT,
      event_type TEXT,
      class_grade TEXT,
      class_letter TEXT,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clubs (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      meeting_schedule TEXT,
      meeting_location TEXT,
      leader_id UUID NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'approved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS club_members (
      id UUID PRIMARY KEY,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(club_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      name TEXT,
      is_group BOOLEAN NOT NULL DEFAULT FALSE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversation_participants (
      id UUID PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      attachment_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT,
      message TEXT,
      related_id UUID,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
      comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS post_attachments (
      id UUID PRIMARY KEY,
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT 'blue';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id UUID;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS post_id UUID;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS comment_id UUID;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id UUID;
  `);
}



async function createNotification(userId, type, actorId, postId = null, commentId = null) {
  if (userId === actorId) return;
  try {
    const actor = await db.prepare('SELECT full_name FROM users WHERE id = ?').get(actorId);
    const actorName = actor?.full_name || 'Някой';
    const payloads = {
      like: { title: 'Ново харесване', message: `${actorName} хареса твоя публикация.` },
      comment: { title: 'Нов коментар', message: `${actorName} коментира твоя публикация.` },
      mention: { title: 'Споменаване', message: `${actorName} те спомена в публикация или коментар.` }
    };
    const payload = payloads[type] || { title: 'Известие', message: `${actorName} има ново действие.` };
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, related_id, actor_id, post_id, comment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, type, payload.title, payload.message, postId || commentId, actorId, postId, commentId);
  } catch (error) {
    console.error('Notification error:', error);
  }
}


function parseMentions(content) {
  if (!content) return [];
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

async function seedData() {
  const count = await db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (count.count > 0) {
    console.log('✓ Data already exists');
    return;
  }

  console.log('Creating sample data...');

  const hashPassword = (p) => bcrypt.hashSync(p, 12);

  // Create users
  const createUser = await db.prepare(`
    INSERT INTO users (id, username, password, full_name, role, class_grade, class_letter, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Admin
  createUser.run(uuidv4(), 'admin', hashPassword('admin123'), 'Иван Георгиев', 'admin', null, null, 'Администратор');

  // Moderator
  createUser.run(uuidv4(), 'director', hashPassword('director123'), 'Мария Димитрова', 'moderator', null, null, 'Директор');

  // Teachers
  const teachers = [];
  ['10', '11', '12'].forEach(grade => {
    ['а', 'б', 'в'].forEach(letter => {
      const id = uuidv4();
      teachers.push(id);
      createUser.run(id, `teacher_${grade}${letter}`, hashPassword('teacher123'), 
        `Учител ${grade}${letter}`, 'teacher', grade, letter, `Класен ръководител ${grade}${letter}`);
    });
  });

  // Students (30 per class = 270 total)
  const students = [];
  const names = ['Александър', 'Георги', 'Димитър', 'Иван', 'Мария', 'Елена', 'Анна', 'Виктория'];
  const lastNames = ['Иванов', 'Петров', 'Георгиев', 'Димитров', 'Христов'];
  
  ['10', '11', '12'].forEach(grade => {
    ['а', 'б', 'в'].forEach(letter => {
      for (let i = 1; i <= 30; i++) {
        const id = uuidv4();
        students.push({ id, grade, letter });
        const firstName = names[Math.floor(Math.random() * names.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        createUser.run(id, `student_${grade}${letter}_${i}`, hashPassword('student123'),
          `${firstName} ${lastName}`, 'student', grade, letter, `Ученик ${grade}${letter} клас`);
      }
    });
  });

  console.log(`✓ Created ${270 + 9 + 2} users`);

  // Create posts
  const createPost = db.prepare(`
    INSERT INTO posts (id, user_id, content, visibility, engagement_score, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `);

  const postTemplates = [
    'Кой знае кога ще е следващият тест по математика? 📚',
    'Утре имаме контролно! Успех на всички! 💪',
    'Кой иде на футбола след училище? ⚽',
    'Благодаря на учителя за интересния урок днес! 📖',
    'Някой да споделя записките от вчера? 📝',
    'Кой ще участва в олимпиадата? 🏆',
    'Време е за почивка! 🎉',
    'Имам въпрос за домашното. Може ли някой да помогне? 🤔',
    'Екскурзията беше страхотна! 🚌',
    'Кой иска да играем баскетбол в събота? 🏀'
  ];

  for (let i = 0; i < 500; i++) {
    const student = students[Math.floor(Math.random() * students.length)];
    const template = postTemplates[Math.floor(Math.random() * postTemplates.length)];
    const visibility = Math.random() > 0.5 ? 'public' : (Math.random() > 0.5 ? 'class' : 'grade');
    const hoursAgo = -Math.floor(Math.random() * 720); // Last 30 days
    
    createPost.run(uuidv4(), student.id, template, visibility, 
      Math.floor(Math.random() * 50), hoursAgo.toString());
  }

  console.log('✓ Created 500 posts');

  // Create clubs
  const createClub = db.prepare(`
    INSERT INTO clubs (id, name, description, meeting_schedule, meeting_location, leader_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const clubs = [
    { name: 'Робототехника', desc: 'Програмиране и роботика', schedule: 'Вт и Чт, 15:00-17:00', location: 'Каб. 401' },
    { name: 'Футболен отбор', desc: 'Училищен футболен отбор', schedule: 'Пн, Ср, Пт, 16:00-18:00', location: 'Стадион' },
    { name: 'Литературен клуб', desc: 'Четем и обсъждаме книги', schedule: 'Вт, 15:00-16:30', location: 'Библиотека' },
    { name: 'Драматичен театър', desc: 'Театрална трупа', schedule: 'Пн и Ср, 16:00-18:00', location: 'Актова зала' }
  ];

  clubs.forEach(club => {
    const clubId = uuidv4();
    createClub.run(clubId, club.name, club.desc, club.schedule, club.location, teachers[0], 'approved');
    
    // Add members
    const addMember = db.prepare('INSERT INTO club_members (id, club_id, user_id, role) VALUES (?, ?, ?, ?)');
    addMember.run(uuidv4(), clubId, teachers[0], 'leader');
    
    for (let i = 0; i < 15; i++) {
      const student = students[Math.floor(Math.random() * students.length)];
      try {
        addMember.run(uuidv4(), clubId, student.id, 'member');
      } catch (e) { /* Ignore duplicates */ }
    }
  });

  console.log('✓ Created clubs');

  // Calendar events
  const createEvent = db.prepare(`
    INSERT INTO calendar_events (id, title, description, location, event_date, event_time, event_type, class_grade, class_letter, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const admin = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  
  createEvent.run(uuidv4(), 'Коледна ваканция', 'Зимна почивка', null, '2026-12-23', null, 'holiday', null, null, admin.id);
  createEvent.run(uuidv4(), 'Училищен бал', 'Годишен бал', 'Актова зала', '2026-03-08', '19:00', 'event', null, null, admin.id);
  createEvent.run(uuidv4(), 'Спортен ден', 'Спортни състезания', 'Стадион', '2026-05-15', '10:00', 'event', null, null, admin.id);

  console.log('✓ Created calendar events');
  console.log('========================================');
  console.log('Sample data created successfully!');
  console.log('Login: student_11а_1 / student123');
  console.log('========================================');
}

// API Routes


// Auth & Sessions
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const stored = user.password;
    const isHash = typeof stored === 'string' && stored.startsWith('$2');
    const ok = isHash ? bcrypt.compareSync(password, stored) : (password === stored);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    if (!isHash) {
      const hashed = bcrypt.hashSync(password, 12);
      await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
      user.password = hashed;
    }
    if (user.two_factor_enabled && user.two_factor_secret) {
      const tempLoginToken = crypto.randomUUID();
      pendingTwoFactorLogins.set(tempLoginToken, { userId: user.id, expiresAt: Date.now() + 5 * 60 * 1000 });
      return res.json({ requires_2fa: true, temp_login_token: tempLoginToken, user_hint: { username: user.username, full_name: user.full_name } });
    }
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(uuidv4(), user.id, token, expires);
    setSessionCookie(req, res, token);
    res.json({ user: buildSanitizedUser(user), session_token: token });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/login/2fa', async (req, res) => {
  try {
    const { temp_login_token, code } = req.body;
    const pending = pendingTwoFactorLogins.get(temp_login_token);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingTwoFactorLogins.delete(temp_login_token);
      return res.status(401).json({ error: '2FA session expired. Please log in again.' });
    }
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(pending.userId);
    if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
      pendingTwoFactorLogins.delete(temp_login_token);
      return res.status(400).json({ error: '2FA is not enabled for this account.' });
    }
    if (!verifyTotp(user.two_factor_secret, code)) return res.status(401).json({ error: 'Invalid 2FA code.' });
    pendingTwoFactorLogins.delete(temp_login_token);
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(uuidv4(), user.id, token, expires);
    setSessionCookie(req, res, token);
    res.json({ user: buildSanitizedUser(user), session_token: token });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/verify-session', authMiddleware, async (req, res) => res.json({ user: buildSanitizedUser(req.user) }));

app.post('/api/logout', async (req, res) => {
  try {
    const token = getSessionTokenFromRequest(req);
    if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    clearSessionCookie(req, res);
    res.json({ message: 'Logged out' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/me/preferences', authMiddleware, async (req, res) => {
  res.json({ theme: req.user.theme || 'light', accent_color: req.user.accent_color || 'blue', two_factor_enabled: !!req.user.two_factor_enabled });
});

app.patch('/api/me/preferences', authMiddleware, async (req, res) => {
  try {
    const allowedThemes = new Set(['light', 'dark']);
    const allowedAccents = new Set(['blue', 'purple', 'green', 'orange', 'rose', 'red']);
    const theme = allowedThemes.has(req.body.theme) ? req.body.theme : (req.user.theme || 'light');
    const rawAccent = allowedAccents.has(req.body.accent_color) ? req.body.accent_color : (req.user.accent_color || 'blue');
    const accent = rawAccent === 'red' ? 'rose' : rawAccent;
    await db.prepare('UPDATE users SET theme = ?, accent_color = ? WHERE id = ?').run(theme, accent, req.user.id);
    res.json({ theme, accent_color: accent, two_factor_enabled: !!req.user.two_factor_enabled });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/me/2fa/setup', authMiddleware, async (req, res) => {
  try {
    const secret = randomBase32Secret(32);
    await db.prepare('UPDATE users SET two_factor_secret = ?, two_factor_enabled = FALSE WHERE id = ?').run(secret, req.user.id);
    const issuer = encodeURIComponent('School Social Network');
    const label = encodeURIComponent(req.user.username);
    const otpauth_url = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    res.json({ secret, otpauth_url });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/me/2fa/verify', authMiddleware, async (req, res) => {
  try {
    const row = await db.prepare('SELECT two_factor_secret FROM users WHERE id = ?').get(req.user.id);
    if (!row?.two_factor_secret) return res.status(400).json({ error: '2FA setup has not been started.' });
    if (!verifyTotp(row.two_factor_secret, req.body.code)) return res.status(401).json({ error: 'Invalid 2FA code.' });
    await db.prepare('UPDATE users SET two_factor_enabled = TRUE WHERE id = ?').run(req.user.id);
    res.json({ success: true, two_factor_enabled: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/me/2fa/disable', authMiddleware, async (req, res) => {
  try {
    const user = await db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    const stored = user.password;
    const ok = typeof stored === 'string' && stored.startsWith('$2') ? bcrypt.compareSync(req.body.password || '', stored) : (req.body.password === stored);
    if (!ok) return res.status(401).json({ error: 'Invalid password.' });
    await db.prepare('UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL WHERE id = ?').run(req.user.id);
    res.json({ success: true, two_factor_enabled: false });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Users
app.get('/api/users/search/:query', authMiddleware, async (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const users = await db.prepare(`
      SELECT id, username, full_name, role, class_grade, class_letter 
      FROM users 
      WHERE full_name LIKE ? OR username LIKE ? 
      LIMIT 20
    `).all(query, query);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile
app.get('/api/users/:userId/profile', authMiddleware, async (req, res) => {
  try {
    const user = await db.prepare(`
      SELECT id, username, email, full_name, role, class_grade, class_letter, bio, profile_picture, created_at
      FROM users
      WHERE id = ?
    `).get(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's posts
    const posts = await db.prepare(`
      SELECT 
        p.*,
        u.full_name, u.role, u.class_grade, u.class_letter, u.profile_picture,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);
    
    user.posts = posts;
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
app.patch('/api/users/:userId/profile', authMiddleware, async (req, res) => {
  try {
    const { bio, profile_picture } = req.body;
    
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Can only update your own profile' });
    }
    
    await db.prepare('UPDATE users SET bio = ?, profile_picture = ? WHERE id = ?').run(bio, profile_picture, req.params.userId);
    
    const user = await db.prepare('SELECT id, username, full_name, role, class_grade, class_letter, bio, profile_picture FROM users WHERE id = ?').get(req.params.userId);
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Management (Admin Only)
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const users = await db.prepare(`
      SELECT id, username, email, full_name, role, class_grade, class_letter, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/create', authMiddleware, async (req, res) => {
  try {
    const { full_name, email, role, class_grade, class_letter } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Validate required fields
    if (!full_name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Check if email already exists
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Generate username from email (part before @)
    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;
    
    // Make username unique
    while (await db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }
    
    // Generate secure random password
    const password = crypto.randomBytes(8).toString('base64').slice(0, 12).replace(/[^a-zA-Z0-9]/g, '') + Math.floor(Math.random() * 100);
    
    // Create user
    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 12);
    const bio = role === 'student' && class_grade ? 
      `Ученик ${class_grade}${class_letter} клас` : 
      role === 'teacher' ? 'Учител' : '';
    
    await db.prepare(`
      INSERT INTO users (id, username, password, email, full_name, role, class_grade, class_letter, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, hashedPassword, email, full_name, role, class_grade || null, class_letter || null, bio);
    
    // Return the created user WITH password
    const user = {
      id,
      username,
      password, //Send password to admin so they can give it to student
      email,
      full_name,
      role,
      class_grade,
      class_letter
    };
    
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:userId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Don't allow deleting yourself
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    // Delete user (cascades to posts, comments, etc.)
    await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.userId);
    
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Feed
app.get('/api/feed/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    let posts;
    if (user.role === 'student') {
      posts = await db.prepare(`
        SELECT DISTINCT
          p.*,
          u.full_name, u.role, u.class_grade, u.class_letter,
          (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
          CASE
            WHEN u.class_grade = ? AND u.class_letter = ? THEN 1000
            WHEN u.class_grade = ? THEN 500
            ELSE 10
          END as priority
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE 
          p.visibility = 'public' OR
          (p.visibility = 'grade' AND u.class_grade = ?) OR
          (p.visibility = 'class' AND u.class_grade = ? AND u.class_letter = ?)
        ORDER BY priority DESC, p.created_at DESC
        LIMIT 100
      `).all(user.class_grade, user.class_letter, user.class_grade, user.class_grade, user.class_grade, user.class_letter);
    } else {
      posts = await db.prepare(`
        SELECT 
          p.*,
          u.full_name, u.role, u.class_grade, u.class_letter,
          (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.visibility = 'public'
        ORDER BY p.created_at DESC
        LIMIT 100
      `).all();
    }

    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Posts
app.get('/api/posts/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await db.prepare(`
      SELECT 
        p.*,
        u.full_name, u.role, u.class_grade, u.class_letter, u.profile_picture,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(req.params.postId);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts', authMiddleware, async (req, res) => {
  try {
    const { content, image_url, visibility, attachments } = req.body;
    const user_id = req.user.id;
    const id = uuidv4();
    const created_at = new Date().toISOString();
    
    await db.prepare('INSERT INTO posts (id, user_id, content, image_url, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, user_id, content, image_url || null, visibility || 'public', created_at);

    // Parse mentions and notify
    const mentions = parseMentions(content);
    for (const username of mentions) {
      const mentionedUser = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (mentionedUser && mentionedUser.id !== user_id) {
        await createNotification(mentionedUser.id, 'mention', user_id, id);
      }
    }

    // Handle attachments
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        await db.prepare('INSERT INTO post_attachments (id, post_id, filename, file_url, file_type, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
          uuidv4(),
          id,
          att.filename,
          att.file_url,
          att.file_type,
          att.file_size || 0
        );
      }
    }

    const post = await db.prepare(`
      SELECT p.*, u.full_name, u.role, u.class_grade, u.class_letter, u.profile_picture,
        0 as like_count, 0 as comment_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(id);

    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;
    const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    
    if (post.user_id !== user_id && user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Likes
app.post('/api/posts/:postId/like', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const user_id = req.user.id;

    const existing = await db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(postId, user_id);

    if (existing) {
      await db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
      res.json({ liked: false });
    } else {
      await db.prepare('INSERT INTO likes (id, post_id, user_id) VALUES (?, ?, ?)').run(uuidv4(), postId, user_id);
      
      // Create notification
      const post = await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
      if (post) {
        createNotification(post.user_id, 'like', user_id, postId);
      }
      
      res.json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/posts/:postId/liked/:userId', authMiddleware, async (req, res) => {
  try {
    const like = await db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(req.params.postId, req.user.id);
    res.json({ liked: !!like });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Comments
app.get('/api/posts/:postId/comments', authMiddleware, async (req, res) => {
  try {
    const comments = await db.prepare(`
      SELECT c.*, u.full_name, u.role, u.class_grade, u.class_letter
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).all(req.params.postId);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts/:postId/comments', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const user_id = req.user.id;
    const id = uuidv4();
    const created_at = new Date().toISOString();
    
    await db.prepare('INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, req.params.postId, user_id, content, created_at);

    // Notify post owner
    const post = await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(req.params.postId);
    if (post) {
      createNotification(post.user_id, 'comment', user_id, req.params.postId, id);
    }
    
    // Parse mentions and notify
    const mentions = parseMentions(content);
    for (const username of mentions) {
      const mentionedUser = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (mentionedUser && mentionedUser.id !== user_id) {
        await createNotification(mentionedUser.id, 'mention', user_id, req.params.postId);
      }
    }


    const comment = await db.prepare(`
      SELECT c.*, u.full_name, u.role, u.class_grade, u.class_letter, u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(id);

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/comments/:id', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;
    const comment = await db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);

    if (comment.user_id !== user_id && user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calendar
app.get('/api/calendar', authMiddleware, async (req, res) => {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    let events;
    if (user && user.role === 'student') {
      events = await db.prepare(`
        SELECT e.*, u.full_name as created_by_name
        FROM calendar_events e
        JOIN users u ON e.created_by = u.id
        WHERE 
          (e.class_grade IS NULL) OR
          (e.class_grade = ? AND e.class_letter = ?)
        ORDER BY e.event_date ASC
      `).all(user.class_grade, user.class_letter);
    } else {
      events = await db.prepare(`
        SELECT e.*, u.full_name as created_by_name
        FROM calendar_events e
        JOIN users u ON e.created_by = u.id
        ORDER BY e.event_date ASC
      `).all();
    }

    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/calendar/:id', authMiddleware, async (req, res) => {
  try {
    const event = await db.prepare(`
      SELECT e.*, u.full_name as created_by_name
      FROM calendar_events e
      JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/calendar/:id', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;

    const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const event = await db.prepare('SELECT id, created_by FROM calendar_events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const isAdmin = user.role === 'admin';
    const isCreator = event.created_by === user.id;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ error: 'Not authorized to delete this event' });
    }

    await db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calendar', authMiddleware, async (req, res) => {
  try {
    const { title, description, location, event_date, event_time, event_type, class_grade, class_letter } = req.body;
    const created_by = req.user.id;
    const id = uuidv4();
    
    await db.prepare(`
      INSERT INTO calendar_events (id, title, description, location, event_date, event_time, event_type, class_grade, class_letter, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description, location, event_date, event_time, event_type, class_grade, class_letter, created_by);

    const event = await db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clubs
app.get('/api/clubs', authMiddleware, async (req, res) => {
  try {
    const clubs = await db.prepare(`
      SELECT c.*, u.full_name as leader_name,
        (SELECT COUNT(*) FROM club_members WHERE club_id = c.id) as member_count
      FROM clubs c
      JOIN users u ON c.leader_id = u.id
      WHERE c.status = 'approved'
      ORDER BY c.name
    `).all();
    res.json(clubs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clubs/:id', async (req, res) => {
  try {
    const club = await db.prepare(`
      SELECT c.*, u.full_name as leader_name,
        (SELECT COUNT(*) FROM club_members WHERE club_id = c.id) as member_count
      FROM clubs c
      JOIN users u ON c.leader_id = u.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const members = await db.prepare(`
      SELECT u.id, u.full_name, u.role, u.class_grade, u.class_letter, cm.role as member_role
      FROM club_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.club_id = ?
      ORDER BY cm.role DESC, u.full_name
    `).all(req.params.id);

    club.members = members;
    res.json(club);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/clubs/:clubId', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;

    const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const club = await db.prepare('SELECT id, leader_id FROM clubs WHERE id = ?').get(req.params.clubId);
    if (!club) return res.status(404).json({ error: 'Club not found' });

    const isAdmin = user.role === 'admin';
    const isLeader = club.leader_id === user.id;

    if (!isAdmin && !isLeader) {
      return res.status(403).json({ error: 'Not authorized to delete this club' });
    }

    await db.prepare('DELETE FROM club_members WHERE club_id = ?').run(club.id);
    await db.prepare('DELETE FROM clubs WHERE id = ?').run(club.id);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clubs/:clubId/is-member/:userId', authMiddleware, async (req, res) => {
  try {
    const member = await db.prepare('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?').get(req.params.clubId, req.params.userId);
    res.json({ isMember: !!member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clubs', authMiddleware, async (req, res) => {
  try {
    const { name, description, meeting_schedule, meeting_location, leader_id } = req.body;
    const id = uuidv4();
    
    await db.prepare('INSERT INTO clubs (id, name, description, meeting_schedule, meeting_location, leader_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, description, meeting_schedule, meeting_location, leader_id);

    await db.prepare('INSERT INTO club_members (id, club_id, user_id, role) VALUES (?, ?, ?, ?)').run(uuidv4(), id, leader_id, 'leader');

    const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(id);
    res.status(201).json(club);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clubs/:clubId/join', authMiddleware, async (req, res) => {
  try {
    const { user_id } = req.body;
    const existing = await db.prepare('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?').get(req.params.clubId, user_id);

    if (existing) {
      return res.status(400).json({ error: 'Already a member' });
    }

    await db.prepare('INSERT INTO club_members (id, club_id, user_id, role) VALUES (?, ?, ?, ?)').run(uuidv4(), req.params.clubId, user_id, 'member');

    res.json({ message: 'Joined club' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/clubs/:clubId/leave', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;
    
    await db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(req.params.clubId, user_id);

    res.json({ message: 'Left club' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Messages
app.get('/api/messages/conversations/:userId', authMiddleware, async (req, res) => {
  try {
    const conversations = await db.prepare(`
      SELECT DISTINCT c.*,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM conversations c
      JOIN conversation_participants cp ON c.id = cp.conversation_id
      WHERE cp.user_id = ?
      ORDER BY c.created_at DESC
    `).all(req.user.id);

    for (const conv of conversations) {
      if (!conv.is_group) {
        const other = await db.prepare(`
          SELECT u.full_name
          FROM conversation_participants cp
          JOIN users u ON cp.user_id = u.id
          WHERE cp.conversation_id = ? AND cp.user_id != ?
        `).get(conv.id, req.user.id);

        conv.name = other ? other.full_name : 'Разговор';
      }
    }

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:conversationId', authMiddleware, async (req, res) => {
  try {
    const messages = await db.prepare(`
      SELECT m.*, u.full_name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(req.params.conversationId);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages/conversations', authMiddleware, async (req, res) => {
  try {
    const { participants, is_group, name } = req.body;
    const convId = uuidv4();
    const allParticipants = Array.from(new Set([req.user.id, ...(participants || [])]));
    
    await db.prepare('INSERT INTO conversations (id, name, is_group, created_by) VALUES (?, ?, ?, ?)').run(convId, name || null, !!is_group, req.user.id);

    for (const userId of allParticipants) {
      await db.prepare('INSERT INTO conversation_participants (id, conversation_id, user_id) VALUES (?, ?, ?)').run(uuidv4(), convId, userId);
    }

    const conversation = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
    res.status(201).json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { conversation_id, content } = req.body;
    const sender_id = req.user.id;
    const id = uuidv4();
    
    await db.prepare('INSERT INTO messages (id, sender_id, conversation_id, content) VALUES (?, ?, ?, ?)').run(id, sender_id, conversation_id, content);

    const message = await db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.delete('/api/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;
    const messageId = req.params.messageId;

    const msg = await db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(user_id);
    const isAdmin = user && String(user.role).toLowerCase() === 'admin';

    if (!isAdmin && msg.sender_id !== user_id) {
      return res.status(403).json({ error: 'Not allowed to delete this message' });
    }

    await db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// NOTIFICATIONS
app.get('/api/notifications/:userId', authMiddleware, async (req, res) => {
  try {
    const notifications = await db.prepare(`
      SELECT 
        n.*,
        u.full_name as actor_name,
        u.username as actor_username,
        u.profile_picture as actor_picture,
        p.content as post_content
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `).all(req.user.id);
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/:userId/unread-count', authMiddleware, async (req, res) => {
  try {
    const result = await db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE').get(req.user.id);
    res.json({ count: result.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/notifications/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    await db.prepare('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?').run(req.params.notificationId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/notifications/:userId/read-all', authMiddleware, async (req, res) => {
  try {
    await db.prepare('UPDATE notifications SET is_read = TRUE WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ATTACHMENTS
app.get('/api/posts/:postId/attachments', authMiddleware, async (req, res) => {
  try {
    const attachments = await db.prepare('SELECT * FROM post_attachments WHERE post_id = ? ORDER BY created_at ASC').all(req.params.postId);
    res.json(attachments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// MENTION SEARCH
app.get('/api/users/mention-search/:query', authMiddleware, async (req, res) => {
  try {
    const query = `${req.params.query}%`;
    const users = await db.prepare(`
      SELECT id, username, full_name, profile_picture, role, class_grade, class_letter
      FROM users 
      WHERE username LIKE ? OR full_name LIKE ?
      ORDER BY username ASC
      LIMIT 10
    `).all(query, query);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', async (req, res) => {
  res.json({ status: 'OK', message: 'School Social Network API' });
});

async function seedSimpleBulgarianPosts() {
  const users = await db.prepare('SELECT id FROM users').all();
  if (!users || users.length === 0) {
    console.log('No users found. Cannot seed posts.');
    return;
  }

  const postsText = [
    'Някой знае ли кога ще ни върнат контролните по математика?',
    'Утре имаме класно по български, успех на всички!',
    'Кой ще участва в състезанието по информатика тази година?',
    'Напомняне: срокът за проекта по история е до петък.',
    'Има ли свободни места в клуба по роботика?',
    'Днес тренировката по волейбол е от 16:30 в салона.',
    'Моля, споделете материала от последния урок по физика.',
    'Предстои училищният бал – кой вече си е избрал тоалет?',
    'Честит празник на всички ученици и учители!',
    'Кой ще ходи на екскурзията до Пловдив този месец?',
    'Някой има ли записките по химия?',
    'Супер интересен урок днес!',
    'Кога ще качат оценките?',
    'Някой да помогне със задача 5?',
    'Тренировка по баскетбол след часовете 🏀'
  ];

  const visibilityOptions = ['public', 'class', 'grade'];

  const insert = db.prepare(`
    INSERT INTO posts (id, user_id, content, visibility, engagement_score, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `);

  const TOTAL_POSTS = 400; // change if you want more

  for (let i = 0; i < TOTAL_POSTS; i++) {
    const randomUser = users[Math.floor(Math.random() * users.length)];
    const randomContent = postsText[Math.floor(Math.random() * postsText.length)];
    const randomVisibility = visibilityOptions[Math.floor(Math.random() * visibilityOptions.length)];

    // Random timestamp within last 30 days
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const minutesAgo = Math.floor(Math.random() * 60);

    const createdAt = new Date(
      Date.now() - (
        daysAgo * 24 * 60 * 60 * 1000 +
        hoursAgo * 60 * 60 * 1000 +
        minutesAgo * 60 * 1000
      )
    );

    insert.run(
      uuidv4(),
      randomUser.id,
      randomContent,
      randomVisibility,
      createdAt.toISOString()
    );
  }

  console.log(`✓ Seeded ${TOTAL_POSTS} Bulgarian posts with randomized timestamps`);
}


// Start server
(async () => {
  try {
await initDB();

// If Postgres is empty, optionally seed initial data (Postgres-only).
const countRow = await db.prepare('SELECT COUNT(*)::int AS count FROM users').get();
if ((countRow?.count || 0) === 0) {
  const shouldSeed = (process.env.SEED_ON_EMPTY || 'false').toLowerCase() === 'true';
  if (!shouldSeed) {
    console.log('No users found in Postgres. Seeding is disabled (set SEED_ON_EMPTY=true to seed).');
  } else {
    console.log('No users found in Postgres. Seeding sample data...');
    await seedData();
    console.log('✓ Seed finished');
  }
}

// Seed posts if enabled
if ((process.env.SEED_SIMPLE_POSTS || 'false').toLowerCase() === 'true') {
  await seedSimpleBulgarianPosts();
}



  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
