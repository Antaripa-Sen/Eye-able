const pool = require('../config/db');

// POST /api/submissions - save/update in-progress or final submission
const saveSubmission = async (req, res) => {
  const { assignmentId, answerText, isSubmitted, wpm, accuracy } = req.body;
  const studentId = req.user.id;

  try {
    const existing = await pool.query(
      'SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2',
      [assignmentId || null, studentId]
    );

    let result;
    if (existing.rows.length) {
      result = await pool.query(
        `UPDATE submissions SET answer_text = $1, is_submitted = $2, wpm = $3, accuracy = $4, 
         submitted_at = CASE WHEN $2 THEN NOW() ELSE submitted_at END
         WHERE id = $5 RETURNING *`,
        [answerText, isSubmitted || false, wpm || 0, accuracy || 0, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO submissions (assignment_id, student_id, answer_text, is_submitted, wpm, accuracy, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 THEN NOW() ELSE NULL END) RETURNING *`,
        [assignmentId || null, studentId, answerText, isSubmitted || false, wpm || 0, accuracy || 0]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/submissions - teacher gets all; student gets their own
const getSubmissions = async (req, res) => {
  const { role, id } = req.user;
  const { assignmentId } = req.query;
  try {
    if (role === 'teacher') {
      let query = `SELECT s.*, u.full_name, u.email, u.avatar_color FROM submissions s
                   JOIN users u ON u.id = s.student_id`;
      const params = [];
      if (assignmentId) { query += ' WHERE s.assignment_id = $1'; params.push(assignmentId); }
      query += ' ORDER BY s.updated_at DESC';
      const result = await pool.query(query, params);
      res.json(result.rows);
    } else {
      const result = await pool.query(
        'SELECT * FROM submissions WHERE student_id = $1 ORDER BY updated_at DESC',
        [id]
      );
      res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { saveSubmission, getSubmissions };
