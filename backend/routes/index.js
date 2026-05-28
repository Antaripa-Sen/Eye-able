const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');

const auth        = require('../controllers/authController');
const assignments = require('../controllers/assignmentController');
const submissions = require('../controllers/submissionController');
const analytics   = require('../controllers/analyticsController');
const settings    = require('../controllers/settingsController');
const users       = require('../controllers/userController');

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/auth/register', auth.register);
router.post('/auth/login',    auth.login);
router.post('/auth/google',   auth.googleAuth);
router.get('/auth/me',        authenticate, auth.me);

// ── Assignments ───────────────────────────────────────────────────────────────
router.get('/assignments',              authenticate, assignments.getAssignments);
router.get('/assignments/active',       authenticate, requireRole('student'), assignments.getActiveAssignment);
router.post('/assignments',             authenticate, requireRole('teacher'), assignments.createAssignment);
router.patch('/assignments/:id/publish',authenticate, requireRole('teacher'), assignments.togglePublish);
router.delete('/assignments/:id',       authenticate, requireRole('teacher'), assignments.deleteAssignment);

// ── Submissions — specific routes MUST come before :id ───────────────────────
router.get('/submissions/counts',       authenticate, requireRole('teacher'), submissions.getSubmissionCounts);
router.post('/submissions',             authenticate, requireRole('student'),  submissions.saveSubmission);
router.get('/submissions',              authenticate, submissions.getSubmissions);
router.get('/submissions/:id',          authenticate, submissions.getSubmission);
router.patch('/submissions/:id/grade',  authenticate, requireRole('teacher'), submissions.gradeSubmission);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.post('/analytics',               authenticate, analytics.saveAnalytics);
router.get('/analytics/students',       authenticate, requireRole('teacher'), analytics.getStudentsOverview);
router.get('/analytics/:studentId',     authenticate, analytics.getAnalytics);
router.post('/analytics/gaze',          authenticate, analytics.saveGazeData);
router.get('/analytics/gaze/:studentId',authenticate, analytics.getGazeData);

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/settings/:studentId',      authenticate, settings.getSettings);
router.patch('/settings/:studentId',    authenticate, settings.updateSettings);

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users/students',                    authenticate, requireRole('teacher'), users.getStudents);
router.get('/users/me/profile',                  authenticate, users.getProfile);
router.get('/users/notifications',               authenticate, users.getNotifications);
router.patch('/users/notifications/read-all',    authenticate, users.markAllNotificationsRead);
router.patch('/users/notifications/:id/read',    authenticate, users.markNotificationRead);
router.post('/users/sessions/start',             authenticate, users.startSession);
router.patch('/users/sessions/:id/end',          authenticate, users.endSession);

module.exports = router;