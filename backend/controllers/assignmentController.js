const pool = require('../config/db');

// GET /api/assignments - teacher: their assignments; student: published ones assigned to them
const getAssignments = async (req, res) => {
  const { role, id } = req.user;
  try {
    if (role === 'teacher') {
      const result = await pool.query(
        `SELECT a.*, 
          COUNT(DISTINCT asn.student_id) AS student_count,
          COUNT(DISTINCT s.id) FILTER (WHERE s.is_submitted = true) AS submitted_count
         FROM assignments a
         LEFT JOIN assignment_students asn ON asn.assignment_id = a.id
         LEFT JOIN submissions s ON s.assignment_id = a.id
         WHERE a.teacher_id = $1
         GROUP BY a.id ORDER BY a.created_at DESC`,
        [id]
      );
      res.json(result.rows);
    } else {
      const result = await pool.query(
        `SELECT a.*, 
          sub.id AS submission_id, sub.answer_text, sub.is_submitted, sub.wpm, sub.accuracy
         FROM assignments a
         INNER JOIN assignment_students asn ON asn.assignment_id = a.id AND asn.student_id = $1
         LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = $1
         WHERE a.is_published = true
         ORDER BY a.created_at DESC`,
        [id]
      );
      res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/assignments/active - current published assignment for student
const getActiveAssignment = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.* FROM assignments a
       INNER JOIN assignment_students asn ON asn.assignment_id = a.id AND asn.student_id = $1
       WHERE a.is_published = true
       ORDER BY a.created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (!result.rows.length) {
      // Fallback: any published assignment
      const fallback = await pool.query(
        'SELECT * FROM assignments WHERE is_published = true ORDER BY created_at DESC LIMIT 1'
      );
      return res.json(fallback.rows[0] || null);
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/assignments
const createAssignment = async (req, res) => {
  const { title, content, type, difficulty, dueDate, timeLimitMinutes, studentIds } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO assignments (teacher_id, title, content, type, difficulty, due_date, time_limit_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, title, content, type || 'sentence_typing', difficulty || 'medium', dueDate || null, timeLimitMinutes || null]
    );
    const assignment = result.rows[0];

    // Assign to specific students or all students
    if (studentIds && studentIds.length) {
      for (const sid of studentIds) {
        await client.query(
          'INSERT INTO assignment_students (assignment_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [assignment.id, sid]
        );
      }
    } else {
      // Assign to all students
      const students = await client.query("SELECT id FROM users WHERE role = 'student' AND is_active = true");
      for (const s of students.rows) {
        await client.query(
          'INSERT INTO assignment_students (assignment_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [assignment.id, s.id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(assignment);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// PATCH /api/assignments/:id/publish
const togglePublish = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE assignments SET is_published = NOT is_published WHERE id = $1 AND teacher_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/assignments/:id
const deleteAssignment = async (req, res) => {
  try {
    await pool.query('DELETE FROM assignments WHERE id = $1 AND teacher_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAssignments, getActiveAssignment, createAssignment, togglePublish, deleteAssignment };
