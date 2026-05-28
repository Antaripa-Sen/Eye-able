const pool = require('../config/db');

const getStudents = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.avatar_color, u.created_at,
              acs.dwell_time_ms, acs.high_contrast, acs.keyboard_size
       FROM users u
       LEFT JOIN accessibility_settings acs ON acs.student_id = u.id
       WHERE u.role = 'student' AND u.is_active = true
       ORDER BY u.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT u.*, acs.dwell_time_ms, acs.keyboard_size, acs.font_size, acs.high_contrast, acs.highlight_color
       FROM users u
       LEFT JOIN accessibility_settings acs ON acs.student_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    const { password_hash, ...profile } = user.rows[0];
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/users/notifications — only return UNREAD notifications
const getNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE recipient_id = $1 AND is_read = false
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/users/notifications/:id/read — mark read (disappears from list since we only fetch unread)
const markNotificationRead = async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND recipient_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/users/notifications/read-all — mark all read at once
const markAllNotificationsRead = async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const startSession = async (req, res) => {
  try {
    const result = await pool.query(
      'INSERT INTO sessions (user_id) VALUES ($1) RETURNING *',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const endSession = async (req, res) => {
  try {
    await pool.query(
      `UPDATE sessions SET ended_at = NOW(), is_active = false,
       duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getStudents, getProfile, getNotifications,
  markNotificationRead, markAllNotificationsRead,
  startSession, endSession
};