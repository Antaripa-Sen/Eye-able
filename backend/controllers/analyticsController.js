const pool = require('../config/db');

// POST /api/analytics - save session analytics
const saveAnalytics = async (req, res) => {
  const { sessionId, assignmentId, wpm, accuracy, charactersTyped, backspacesUsed, dwellTimeMs, gazeConfidence, sessionDurationSeconds } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO analytics (student_id, session_id, assignment_id, wpm, accuracy, characters_typed, 
       backspaces_used, dwell_time_ms, gaze_confidence, session_duration_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, sessionId||null, assignmentId||null, wpm||0, accuracy||100, charactersTyped||0,
       backspacesUsed||0, dwellTimeMs||500, gazeConfidence||0, sessionDurationSeconds||0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/analytics/:studentId - teacher or self
const getAnalytics = async (req, res) => {
  const targetId = req.params.studentId === 'me' ? req.user.id : req.params.studentId;
  const { range } = req.query; // 'day', 'week', 'month'

  const days = range === 'day' ? 1 : range === 'week' ? 7 : 30;

  try {
    const result = await pool.query(
      `SELECT DATE(recorded_at) AS date,
              ROUND(AVG(wpm)::numeric, 2) AS avg_wpm,
              ROUND(AVG(accuracy)::numeric, 2) AS avg_accuracy,
              SUM(characters_typed) AS total_chars,
              ROUND(AVG(gaze_confidence)::numeric, 2) AS avg_gaze_confidence,
              COUNT(*) AS sessions
       FROM analytics
       WHERE student_id = $1 AND recorded_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(recorded_at) ORDER BY date ASC`,
      [targetId]
    );

    const totals = await pool.query(
      `SELECT ROUND(AVG(wpm)::numeric, 2) AS avg_wpm, ROUND(AVG(accuracy)::numeric, 2) AS avg_accuracy,
              SUM(characters_typed) AS total_chars, COUNT(*) AS total_sessions,
              SUM(session_duration_seconds) AS total_time_seconds
       FROM analytics WHERE student_id = $1`,
      [targetId]
    );

    res.json({ daily: result.rows, totals: totals.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/analytics/gaze - save gaze heatmap data
const saveGazeData = async (req, res) => {
  const { sessionId, keyLabel, hitCount, missCount, avgDwellMs } = req.body;
  try {
    const existing = await pool.query(
      'SELECT id, hit_count, miss_count FROM gaze_data WHERE student_id = $1 AND session_id = $2 AND key_label = $3',
      [req.user.id, sessionId||null, keyLabel]
    );
    if (existing.rows.length) {
      await pool.query(
        'UPDATE gaze_data SET hit_count = hit_count + $1, miss_count = miss_count + $2, avg_dwell_ms = $3 WHERE id = $4',
        [hitCount||1, missCount||0, avgDwellMs||0, existing.rows[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO gaze_data (student_id, session_id, key_label, hit_count, miss_count, avg_dwell_ms) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.user.id, sessionId||null, keyLabel, hitCount||1, missCount||0, avgDwellMs||0]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/analytics/gaze/:studentId
const getGazeData = async (req, res) => {
  const targetId = req.params.studentId === 'me' ? req.user.id : req.params.studentId;
  try {
    const result = await pool.query(
      `SELECT key_label, SUM(hit_count) AS total_hits, SUM(miss_count) AS total_misses,
              ROUND(AVG(avg_dwell_ms)::numeric,0) AS avg_dwell_ms
       FROM gaze_data WHERE student_id = $1
       GROUP BY key_label ORDER BY total_hits DESC`,
      [targetId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/analytics/students - teacher: overview of all students
const getStudentsOverview = async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_color,
              ROUND(AVG(a.wpm)::numeric, 2) AS avg_wpm,
              ROUND(AVG(a.accuracy)::numeric, 2) AS avg_accuracy,
              COUNT(DISTINCT a.id) AS total_sessions,
              MAX(a.recorded_at) AS last_active
       FROM users u
       LEFT JOIN analytics a ON a.student_id = u.id
       WHERE u.role = 'student' AND u.is_active = true
       GROUP BY u.id ORDER BY u.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { saveAnalytics, getAnalytics, saveGazeData, getGazeData, getStudentsOverview };
