const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const onlineStudents = new Map(); // socketId -> { userId, name, role, ... }

module.exports = (io) => {
  // Authenticate socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    // Load user info
    const userResult = await pool.query('SELECT id, full_name, role, email, avatar_color FROM users WHERE id = $1', [socket.userId]);
    if (!userResult.rows.length) return socket.disconnect();
    const user = userResult.rows[0];
    socket.user = user;

    console.log(`🔌 ${user.full_name} (${user.role}) connected`);

    if (user.role === 'student') {
      onlineStudents.set(socket.id, {
        socketId: socket.id,
        userId: user.id,
        name: user.full_name,
        email: user.email,
        avatarColor: user.avatar_color,
        status: 'active',
        typingProgress: '',
        wpm: 0,
        gazeConfidence: 0,
        lastActivity: Date.now(),
        connectedAt: Date.now()
      });

      // Notify all teachers
      io.to('teachers').emit('student:online', { ...onlineStudents.get(socket.id) });
    } else if (user.role === 'teacher') {
      socket.join('teachers');
      // Send current online students
      socket.emit('students:online', Array.from(onlineStudents.values()));
    }

    // Student: live typing update
    socket.on('student:typing', (data) => {
      if (user.role !== 'student') return;
      const studentData = onlineStudents.get(socket.id);
      if (studentData) {
        studentData.typingProgress = data.text || '';
        studentData.wpm = data.wpm || 0;
        studentData.gazeConfidence = data.gazeConfidence || 0;
        studentData.lastActivity = Date.now();
        studentData.status = 'active';
        onlineStudents.set(socket.id, studentData);
        io.to('teachers').emit('student:update', studentData);
      }
    });

    // Student: gaze status update
    socket.on('student:gaze', (data) => {
      if (user.role !== 'student') return;
      const studentData = onlineStudents.get(socket.id);
      if (studentData) {
        studentData.gazeConfidence = data.confidence || 0;
        studentData.webcamActive = data.webcamActive !== false;
        onlineStudents.set(socket.id, studentData);
        io.to('teachers').emit('student:update', studentData);
      }
    });

    // Student: submitted answer
    socket.on('student:submitted', (data) => {
      io.to('teachers').emit('student:answered', { userId: user.id, name: user.full_name, answer: data.text, timestamp: Date.now() });
      // Create notification for teacher
      createNotification(io, 'assignment_completed', `${user.full_name} submitted an answer`, user.id);
    });

    // Teacher: send settings update to specific student
    socket.on('teacher:updateSettings', (data) => {
      if (user.role !== 'teacher') return;
      // Find student socket
      for (const [sid, sData] of onlineStudents.entries()) {
        if (sData.userId === data.studentId) {
          io.to(sid).emit('settings:updated', data.settings);
          break;
        }
      }
    });

    // Teacher: trigger recalibration
    socket.on('teacher:recalibrate', (data) => {
      if (user.role !== 'teacher') return;
      for (const [sid, sData] of onlineStudents.entries()) {
        if (sData.userId === data.studentId) {
          io.to(sid).emit('calibration:requested');
          break;
        }
      }
    });

    // Idle detection
    const idleInterval = setInterval(() => {
      if (user.role !== 'student') return;
      const studentData = onlineStudents.get(socket.id);
      if (studentData && Date.now() - studentData.lastActivity > 30000) {
        studentData.status = 'idle';
        onlineStudents.set(socket.id, studentData);
        io.to('teachers').emit('student:update', studentData);
      }
    }, 10000);

    socket.on('disconnect', () => {
      clearInterval(idleInterval);
      if (user.role === 'student') {
        const studentData = onlineStudents.get(socket.id);
        onlineStudents.delete(socket.id);
        io.to('teachers').emit('student:offline', { userId: user.id });
        if (studentData) {
          createNotification(io, 'student_disconnected', `${user.full_name} disconnected`, null);
        }
      }
      console.log(`❌ ${user.full_name} disconnected`);
    });
  });

  async function createNotification(io, type, message, fromUserId) {
    try {
      const teachers = await pool.query("SELECT id FROM users WHERE role = 'teacher' AND is_active = true");
      const title = type === 'student_disconnected' ? 'Student Disconnected' :
                    type === 'assignment_completed' ? 'Assignment Submitted' : 'Notification';
      for (const teacher of teachers.rows) {
        await pool.query(
          'INSERT INTO notifications (recipient_id, type, title, message) VALUES ($1, $2, $3, $4)',
          [teacher.id, type, title, message]
        );
      }
      io.to('teachers').emit('notification:new', { type, title, message, timestamp: Date.now() });
    } catch (err) {
      console.error('Notification error:', err.message);
    }
  }
};
