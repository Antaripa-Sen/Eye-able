const pool = require('../config/db');

// GET /api/settings/:studentId
const getSettings = async (req, res) => {
  const studentId = req.params.studentId === 'me' ? req.user.id : req.params.studentId;
  try {
    const result = await pool.query('SELECT * FROM accessibility_settings WHERE student_id = $1', [studentId]);
    if (!result.rows.length) {
      // Create defaults
      const ins = await pool.query(
        'INSERT INTO accessibility_settings (student_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *',
        [studentId]
      );
      return res.json(ins.rows[0] || { student_id: studentId, dwell_time_ms: 500, font_size: 24, high_contrast: false, highlight_color: '#ffd700', keyboard_size: 'medium', key_spacing: 12, prediction_sensitivity: 0.15 });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/settings/:studentId - teacher or self can update
const updateSettings = async (req, res) => {
  const studentId = req.params.studentId === 'me' ? req.user.id : req.params.studentId;
  const { dwellTimeMs, keyboardSize, fontSize, keySpacing, highContrast, highlightColor, predictionSensitivity } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO accessibility_settings (student_id, dwell_time_ms, keyboard_size, font_size, key_spacing, high_contrast, highlight_color, prediction_sensitivity, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (student_id) DO UPDATE SET
         dwell_time_ms = COALESCE($2, accessibility_settings.dwell_time_ms),
         keyboard_size = COALESCE($3, accessibility_settings.keyboard_size),
         font_size = COALESCE($4, accessibility_settings.font_size),
         key_spacing = COALESCE($5, accessibility_settings.key_spacing),
         high_contrast = COALESCE($6, accessibility_settings.high_contrast),
         highlight_color = COALESCE($7, accessibility_settings.highlight_color),
         prediction_sensitivity = COALESCE($8, accessibility_settings.prediction_sensitivity),
         updated_by = $9
       RETURNING *`,
      [studentId, dwellTimeMs, keyboardSize, fontSize, keySpacing, highContrast, highlightColor, predictionSensitivity, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getSettings, updateSettings };
