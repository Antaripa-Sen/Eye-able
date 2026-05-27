const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// POST /api/auth/register
const register = async (req, res) => {
  const { email, password, fullName, role } = req.body;
  if (!email || !password || !fullName || !role) return res.status(400).json({ error: 'All fields required' });
  if (!['teacher', 'student'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const client = await pool.connect();
  try {
    const exists = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const avatarColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

    const result = await client.query(
      'INSERT INTO users (email, password_hash, full_name, role, avatar_color) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role, avatar_color',
      [email.toLowerCase(), passwordHash, fullName, role, avatarColor]
    );

    const user = result.rows[0];

    // Create default accessibility settings for students
    if (role === 'student') {
      await client.query('INSERT INTO accessibility_settings (student_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    }

    const token = generateToken(user.id);
    res.status(201).json({ token, user });
  } finally {
    client.release();
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase()]);
  if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

  const user = result.rows[0];
  if (!user.password_hash) return res.status(401).json({ error: 'Please sign in with Google' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, avatar_color: user.avatar_color } });
};

// POST /api/auth/google
const googleAuth = async (req, res) => {
  const { googleUid, email, fullName, role } = req.body;
  if (!googleUid || !email) return res.status(400).json({ error: 'Google UID and email required' });

  const client = await pool.connect();
  try {
    // Check if user exists by google_uid or email
    let result = await client.query('SELECT * FROM users WHERE google_uid = $1 OR email = $2 LIMIT 1', [googleUid, email.toLowerCase()]);

    let user;
    if (result.rows.length) {
      user = result.rows[0];
      // Update google_uid if missing
      if (!user.google_uid) {
        await client.query('UPDATE users SET google_uid = $1 WHERE id = $2', [googleUid, user.id]);
      }
    } else {
      // New user via Google
      if (!role || !['teacher', 'student'].includes(role)) return res.status(400).json({ error: 'Role required for new users' });
      const avatarColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
      const insertResult = await client.query(
        'INSERT INTO users (email, full_name, role, google_uid, avatar_color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [email.toLowerCase(), fullName || email, role, googleUid, avatarColor]
      );
      user = insertResult.rows[0];
      if (role === 'student') {
        await client.query('INSERT INTO accessibility_settings (student_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
      }
    }

    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, avatar_color: user.avatar_color } });
  } finally {
    client.release();
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = { register, login, googleAuth, me };
