const pool = require('../config/db');

function deriveStatus(sub) {
  if (!sub.is_submitted) return 'pending';
  if (sub.graded_at) return 'reviewed';
  return 'submitted';
}

// POST /api/submissions
const saveSubmission = async (req, res) => {
  const { assignmentId, answerText, isSubmitted, wpm, accuracy } = req.body;
  const studentId = req.user.id;
  try {
    const existing = await pool.query(
      `SELECT id FROM submissions WHERE assignment_id IS NOT DISTINCT FROM $1 AND student_id = $2`,
      [assignmentId || null, studentId]
    );
    let result;
    if (existing.rows.length) {
      result = await pool.query(
        `UPDATE submissions SET
           answer_text  = $1,
           is_submitted = $2,
           wpm          = $3,
           accuracy     = $4,
           submitted_at = CASE WHEN $2 = true AND submitted_at IS NULL THEN NOW() ELSE submitted_at END,
           updated_at   = NOW()
         WHERE id = $5 RETURNING *`,
        [answerText, isSubmitted || false, wpm || 0, accuracy || 0, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO submissions (assignment_id, student_id, answer_text, is_submitted, wpm, accuracy, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 = true THEN NOW() ELSE NULL END) RETURNING *`,
        [assignmentId || null, studentId, answerText, isSubmitted || false, wpm || 0, accuracy || 0]
      );
    }
    const row = result.rows[0];
    // Push to teachers via socket
    if (isSubmitted) {
      try {
        const { getIO } = require('../sockets/socketHandler');
        const io = getIO();
        if (io) {
          const enriched = await pool.query(
            `SELECT s.*, u.full_name, u.email, u.avatar_color,
                    a.title AS assignment_title,
                    COALESCE(a.total_marks, 10) AS assignment_total_marks
             FROM submissions s
             JOIN users u ON u.id = s.student_id
             LEFT JOIN assignments a ON a.id = s.assignment_id
             WHERE s.id = $1`,
            [row.id]
          );
          if (enriched.rows.length) {
            const r = enriched.rows[0];
            io.to('teachers').emit('submission:new', { ...r, status: deriveStatus(r) });
          }
        }
      } catch (_) {}
    }
    res.json({ ...row, status: deriveStatus(row) });
  } catch (err) {
    console.error('[saveSubmission]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/submissions
const getSubmissions = async (req, res) => {
  const { role, id } = req.user;
  const { assignmentId } = req.query;
  try {
    if (role === 'teacher') {
      let query = `
        SELECT s.*,
               u.full_name, u.email, u.avatar_color,
               a.title AS assignment_title,
               COALESCE(a.total_marks, 10) AS assignment_total_marks
        FROM submissions s
        JOIN users u ON u.id = s.student_id
        LEFT JOIN assignments a ON a.id = s.assignment_id
        WHERE s.is_submitted = true
      `;
      const params = [];
      if (assignmentId) { params.push(assignmentId); query += ` AND s.assignment_id = $${params.length}`; }
      query += ' ORDER BY s.submitted_at DESC NULLS LAST, s.updated_at DESC';
      const result = await pool.query(query, params);
      return res.json(result.rows.map(r => ({ ...r, status: deriveStatus(r) })));
    }
    // Student: own submissions
    const result = await pool.query(
      `SELECT s.*,
              a.title AS assignment_title,
              COALESCE(a.total_marks, 10) AS assignment_total_marks,
              a.content AS assignment_content
       FROM submissions s
       LEFT JOIN assignments a ON a.id = s.assignment_id
       WHERE s.student_id = $1
       ORDER BY s.updated_at DESC`,
      [id]
    );
    return res.json(result.rows.map(r => ({ ...r, status: deriveStatus(r) })));
  } catch (err) {
    console.error('[getSubmissions]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/submissions/counts
const getSubmissionCounts = async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teachers only' });
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                          AS total_submissions,
        COUNT(*) FILTER (WHERE graded_at IS NOT NULL)     AS reviewed_count,
        COUNT(*) FILTER (WHERE graded_at IS NULL)         AS pending_review_count
      FROM submissions
      WHERE is_submitted = true
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[getSubmissionCounts]', err.message);
    // Return zeros instead of crashing if columns missing
    res.json({ total_submissions: 0, reviewed_count: 0, pending_review_count: 0 });
  }
};

// GET /api/submissions/:id
const getSubmission = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name, u.email, u.avatar_color,
              a.title AS assignment_title,
              a.content AS assignment_content,
              COALESCE(a.total_marks, 10) AS assignment_total_marks
       FROM submissions s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const sub = result.rows[0];
    if (req.user.role === 'student' && sub.student_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    return res.json({ ...sub, status: deriveStatus(sub) });
  } catch (err) {
    console.error('[getSubmission]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/submissions/:id/grade
const gradeSubmission = async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teachers only' });
  const { marks, totalMarks, feedback, correction } = req.body;
  if (marks === undefined || marks === null) return res.status(400).json({ error: 'marks required' });
  const client = await pool.connect();
  try {
    const subRes = await client.query(
      `SELECT s.*, COALESCE(a.total_marks, 10) AS assignment_total_marks
       FROM submissions s LEFT JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!subRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const sub = subRes.rows[0];
    if (!sub.is_submitted) return res.status(400).json({ error: 'Cannot grade unsubmitted answer' });

    const result = await client.query(
      `UPDATE submissions SET
         marks       = $1,
         total_marks = $2,
         feedback    = $3,
         correction  = $4,
         graded_by   = $5,
         graded_at   = NOW(),
         updated_at  = NOW()
       WHERE id = $6 RETURNING *`,
      [Number(marks), totalMarks || sub.assignment_total_marks || 10, feedback || null, correction || null, req.user.id, req.params.id]
    );
    const updated = result.rows[0];

    // Notify student
    const tm = totalMarks || sub.assignment_total_marks || 10;
    const msg = feedback
      ? `You scored ${marks}/${tm}. Teacher says: ${feedback}`
      : `You scored ${marks}/${tm} on your submission.`;
    await client.query(
      `INSERT INTO notifications (recipient_id, type, title, message) VALUES ($1, 'marks_received', 'Marks Received', $2)`,
      [sub.student_id, msg]
    );

    // Push to student via socket
    try {
      const { getIO } = require('../sockets/socketHandler');
      const io = getIO();
      if (io) {
        io.to(`student:${sub.student_id}`).emit('submission:reviewed', {
          submissionId: req.params.id,
          marks: Number(marks),
          totalMarks: tm,
          feedback: feedback || null,
          correction: correction || null,
          status: 'reviewed',
        });
      }
    } catch (_) {}

    return res.json({ ...updated, status: 'reviewed' });
  } catch (err) {
    console.error('[gradeSubmission]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

module.exports = { saveSubmission, getSubmissions, getSubmission, gradeSubmission, getSubmissionCounts };