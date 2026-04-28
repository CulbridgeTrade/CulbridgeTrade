import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { runValidation } from './src/engine.js';

const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   ENV VALIDATION (FAIL FAST)
========================= */
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET missing');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL missing');
  process.exit(1);
}

/* =========================
   DATABASE
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

/* =========================
   CORE MIDDLEWARE
========================= */
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://culbridge.cloud',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

/* =========================
   HEALTH (CRITICAL)
========================= */
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

/* =========================
   AUTH HELPERS
========================= */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || 'EXPORTER'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/* =========================
   AUTH ROUTES (PUBLIC)
========================= */

// SIGNUP
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'EXPORTER')
       RETURNING id, email, role`,
      [email, hash]
    );

    res.json({ user: result.rows[0] });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/* =========================
   AUTH ROUTES (PROTECTED)
========================= */

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  res.json({ success: true });
});

/* =========================
   BUSINESS ROUTES (PROTECTED)
========================= */

app.post('/api/v1/validate', requireAuth, async (req, res) => {
  try {
    const result = await runValidation(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Validation failed' });
  }
});

app.post('/api/v1/emergency-check', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const result = await runValidation({
      ...req.body,
      files: req.file ? [req.file.buffer] : []
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Emergency check failed' });
  }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});

