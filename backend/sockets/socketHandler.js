const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const onlineStudents = new Map();
let _io = null;

function getIO() { return _io; }
module.exports.getIO = getIO;

module.exports = (io) => {
  _io = io;

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
    let user;
    try {
      const result = await pool.query(
        'SELECT id, full_name, role, email, avatar_color FROM users WHERE id = $1',
        [socket.userId]
      );
      if (!result.rows.length) return socket.disconnect();
      user = result.rows[0];
    } catch (err) {
      console.error('Socket user lookup failed:', err.message);
      return socket.disconnect();
    }

    socket.user = user;
    console.log(`🔌 ${user.full_name} (${user.role}) connected`);

    if (user.role === 'student') {
      const studentData = {
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
        connectedAt: Date.now(),
      };
      onlineStudents.set(socket.id, studentData);
      socket.join(`student:${user.id}`);
      io.to('teachers').emit('student:online', studentData);

    } else if (user.role === 'teacher') {
      socket.join('teachers');
      socket.emit('students:online', Array.from(onlineStudents.values()));
    }

    socket.on('student:typing', (data) => {
      if (user.role !== 'student') return;
      const s = onlineStudents.get(socket.id);
      if (s) {
        s.typingProgress = data.text || '';
        s.wpm = data.wpm || 0;
        s.lastActivity = Date.now();
        s.status = 'active';
        onlineStudents.set(socket.id, s);
        io.to('teachers').emit('student:update', s);
      }
    });

    socket.on('student:gaze', (data) => {
      if (user.role !== 'student') return;
      const s = onlineStudents.get(socket.id);
      if (s) {
        s.gazeConfidence = data.confidence || 0;
        s.webcamActive = data.webcamActive !== false;
        onlineStudents.set(socket.id, s);
        io.to('teachers').emit('student:update', s);
      }
    });

    socket.on('student:submitted', (data) => {
      io.to('teachers').emit('student:answered', {
        userId: user.id, name: user.full_name, answer: data.text, timestamp: Date.now()
      });
      createNotification('assignment_completed', `${user.full_name} submitted an answer`);
    });

    socket.on('teacher:updateSettings', (data) => {
      if (user.role !== 'teacher') return;
      io.to(`student:${data.studentId}`).emit('settings:updated', data.settings);
    });

    socket.on('teacher:recalibrate', (data) => {
      if (user.role !== 'teacher') return;
      io.to(`student:${data.studentId}`).emit('calibration:requested');
    });

    const idleInterval = setInterval(() => {
      if (user.role !== 'student') return;
      const s = onlineStudents.get(socket.id);
      if (s && Date.now() - s.lastActivity > 30000) {
        s.status = 'idle';
        onlineStudents.set(socket.id, s);
        io.to('teachers').emit('student:update', s);
      }
    }, 10000);

    socket.on('disconnect', () => {
      clearInterval(idleInterval);
      if (user.role === 'student') {
        onlineStudents.delete(socket.id);
        io.to('teachers').emit('student:offline', { userId: user.id });
        createNotification('student_disconnected', `${user.full_name} disconnected`);
      }
      console.log(`❌ ${user.full_name} disconnected`);
    });
  });

  async function createNotification(type, message) {
    try {
      const teachers = await pool.query(
        "SELECT id FROM users WHERE role = 'teacher' AND is_active = true"
      );
      const title = type === 'student_disconnected' ? 'Student Disconnected'
                  : type === 'assignment_completed'  ? 'Assignment Submitted'
                  : 'Notification';
      for (const t of teachers.rows) {
        await pool.query(
          'INSERT INTO notifications (recipient_id, type, title, message) VALUES ($1, $2, $3, $4)',
          [t.id, type, title, message]
        );
      }
      io.to('teachers').emit('notification:new', { type, title, message, timestamp: Date.now() });
    } catch (err) {
      console.error('Notification error:', err.message);
    }
  }
};