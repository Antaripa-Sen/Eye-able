import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Users, BookOpen, Bell, LogOut, Plus, RefreshCw, Trash2,
  Wifi, BarChart3, X, Send, Sliders, Star, CheckCircle, MessageSquare,
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { connectSocket, getSocket } from '../services/socket';
import { toast } from '../components/ui/Toast';

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'Pending',   cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    submitted: { label: 'Submitted', cls: 'bg-blue-500/20   text-blue-400   border-blue-500/30'   },
    reviewed:  { label: 'Reviewed',  cls: 'bg-green-500/20  text-green-400  border-green-500/30'  },
  };
  const cfg = map[status] || { label: status || '—', cls: 'bg-white/10 text-white/50 border-white/10' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />{cfg.label}
    </span>
  );
}

export default function TeacherPage() {
  const { user, token, logout, authFetch } = useAuthStore();
  const navigate = useNavigate();

  const [tab,              setTab]              = useState('live');
  const [onlineStudents,   setOnlineStudents]   = useState([]);
  const [allStudents,      setAllStudents]      = useState([]);
  const [assignments,      setAssignments]      = useState([]);
  const [submissions,      setSubmissions]      = useState([]);
  const [subCounts,        setSubCounts]        = useState({ total_submissions: 0, reviewed_count: 0, pending_review_count: 0 });
  const [notifications,    setNotifications]    = useState([]);
  const [analytics,        setAnalytics]        = useState([]);

  const [showNewAssignment,  setShowNewAssignment]  = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);
  const [showGradeModal,     setShowGradeModal]     = useState(false);
  const [selectedStudent,    setSelectedStudent]    = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  const [newAssignment, setNewAssignment] = useState({ title: '', content: '', type: 'sentence_typing', difficulty: 'medium', totalMarks: 10 });
  const [settingsForm,  setSettingsForm]  = useState({ dwellTimeMs: 500, keyboardSize: 'medium', fontSize: 24, highContrast: false, highlightColor: '#ffd700' });
  const [gradeForm,     setGradeForm]     = useState({ marks: '', totalMarks: 10, feedback: '', correction: '' });

  // Kill any stray WebGazer video that might have leaked from student session
  useEffect(() => {
    document.querySelectorAll('video').forEach(v => {
      try { if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; } } catch (_) {}
    });
    try { if (window.webgazer?.end) window.webgazer.end(); } catch (_) {}
  }, []);

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const [studRes, asgRes, subRes, notifRes, analyRes, countsRes] = await Promise.all([
        authFetch('/users/students'),
        authFetch('/assignments'),
        authFetch('/submissions'),
        authFetch('/users/notifications'),
        authFetch('/analytics/students'),
        authFetch('/submissions/counts'),
      ]);
      if (studRes.ok)   setAllStudents(await studRes.json());
      if (asgRes.ok)    setAssignments(await asgRes.json());
      if (subRes.ok)    setSubmissions(await subRes.json());
      if (notifRes.ok)  setNotifications(await notifRes.json()); // already filtered to unread on server
      if (analyRes.ok)  setAnalytics(await analyRes.json());
      if (countsRes.ok) setSubCounts(await countsRes.json());
    } catch (_) {}
  }, [authFetch]);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 15000);
    return () => clearInterval(iv);
  }, [loadAll]);

  // ── Socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    socket.on('students:online', setOnlineStudents);
    socket.on('student:online',  (s) => setOnlineStudents(prev => prev.find(x => x.userId === s.userId) ? prev.map(x => x.userId === s.userId ? s : x) : [...prev, s]));
    socket.on('student:update',  (s) => setOnlineStudents(prev => prev.map(x => x.userId === s.userId ? s : x)));
    socket.on('student:offline', ({ userId }) => setOnlineStudents(prev => prev.filter(x => x.userId !== userId)));
    socket.on('submission:new',  (sub) => {
      setSubmissions(prev => prev.find(s => s.id === sub.id) ? prev : [sub, ...prev]);
      setSubCounts(c => ({ ...c, total_submissions: +c.total_submissions + 1, pending_review_count: +c.pending_review_count + 1 }));
      toast.info(`New submission from ${sub.full_name || 'a student'}`);
    });
    socket.on('notification:new', (n) => {
      setNotifications(prev => [{ ...n, id: Date.now().toString(), created_at: new Date().toISOString() }, ...prev]);
      toast.info(`${n.title}: ${n.message}`);
    });
    return () => {
      socket.off('students:online'); socket.off('student:online'); socket.off('student:update');
      socket.off('student:offline'); socket.off('submission:new'); socket.off('notification:new');
    };
  }, [token]);

  // ── Assignments ────────────────────────────────────────────────────────────
  const createAssignment = async () => {
    if (!newAssignment.title || !newAssignment.content) return toast.error('Title and content required');
    try {
      const res = await authFetch('/assignments', { method: 'POST', body: JSON.stringify(newAssignment) });
      if (!res.ok) return toast.error('Failed to create');
      toast.success('Assignment created!');
      setShowNewAssignment(false);
      setNewAssignment({ title: '', content: '', type: 'sentence_typing', difficulty: 'medium', totalMarks: 10 });
      loadAll();
    } catch { toast.error('Error'); }
  };

  const togglePublish = async (id) => {
    await authFetch(`/assignments/${id}/publish`, { method: 'PATCH' });
    toast.success('Updated'); loadAll();
  };

  const deleteAssignment = async (id) => {
    if (!confirm('Delete this assignment?')) return;
    await authFetch(`/assignments/${id}`, { method: 'DELETE' });
    toast.success('Deleted'); loadAll();
  };

  // ── Grading ────────────────────────────────────────────────────────────────
  const openGradeModal = (sub) => {
    setSelectedSubmission(sub);
    setGradeForm({ marks: sub.marks ?? '', totalMarks: sub.total_marks ?? sub.assignment_total_marks ?? 10, feedback: sub.feedback ?? '', correction: sub.correction ?? '' });
    setShowGradeModal(true);
  };

  const submitGrade = async () => {
    if (gradeForm.marks === '') return toast.error('Enter marks');
    const marks = Number(gradeForm.marks);
    if (isNaN(marks) || marks < 0) return toast.error('Invalid marks');
    if (marks > gradeForm.totalMarks) return toast.error(`Cannot exceed ${gradeForm.totalMarks}`);
    try {
      const res = await authFetch(`/submissions/${selectedSubmission.id}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({ marks, totalMarks: gradeForm.totalMarks, feedback: gradeForm.feedback || null, correction: gradeForm.correction || null }),
      });
      if (!res.ok) { const d = await res.json(); return toast.error(d.error || 'Failed'); }
      toast.success(`✅ Marks sent to ${selectedSubmission.full_name}`);
      setShowGradeModal(false);
      setSubmissions(prev => prev.map(s => s.id === selectedSubmission.id
        ? { ...s, marks, total_marks: gradeForm.totalMarks, feedback: gradeForm.feedback, correction: gradeForm.correction, graded_at: new Date().toISOString(), status: 'reviewed' }
        : s
      ));
      setSubCounts(c => ({ ...c, reviewed_count: +c.reviewed_count + 1, pending_review_count: Math.max(0, +c.pending_review_count - 1) }));
    } catch { toast.error('Grading failed'); }
  };

  // ── Settings ───────────────────────────────────────────────────────────────
  const sendSettings = async () => {
    if (!selectedStudent) return;
    try {
      await authFetch(`/settings/${selectedStudent.id || selectedStudent.userId}`, { method: 'PATCH', body: JSON.stringify(settingsForm) });
      getSocket()?.emit('teacher:updateSettings', { studentId: selectedStudent.id || selectedStudent.userId, settings: settingsForm });
      toast.success('Settings sent'); setShowSettings(false);
    } catch { toast.error('Failed'); }
  };

  const recalibrate = (studentId) => { getSocket()?.emit('teacher:recalibrate', { studentId }); toast.info('Recalibration request sent'); };

  // ── Mark notification read — removes from list immediately ────────────────
  const markRead = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id)); // remove immediately from UI
    await authFetch(`/users/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifications([]); // clear all from UI immediately
    await authFetch('/users/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const tabs = [
    { id: 'live',          label: 'Live Classroom',                                              icon: Wifi     },
    { id: 'assignments',   label: 'Assignments',                                                 icon: BookOpen },
    { id: 'submissions',   label: `Submissions (${subCounts.total_submissions || 0})`,           icon: Send     },
    { id: 'analytics',     label: 'Analytics',                                                   icon: BarChart3 },
    { id: 'notifications', label: `Notifications${notifications.length > 0 ? ` (${notifications.length})` : ''}`, icon: Bell },
  ];

  return (
    <div className="min-h-screen mesh-bg flex">

      {/* Sidebar */}
      <aside className="w-64 glass border-r border-white/5 flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-iris-600/30 border border-iris-500/30 flex items-center justify-center">
              <Eye className="text-iris-400" size={20} />
            </div>
            <div>
              <div className="font-display font-bold text-white text-sm">EyeAble</div>
              <div className="text-white/30 text-xs">Teacher Portal</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${tab === id ? 'bg-iris-600/30 text-iris-300 border border-iris-500/20' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: user?.avatar_color || '#6366f1' }}>
              {user?.full_name?.[0] || 'T'}
            </div>
            <div>
              <div className="text-white/80 text-xs font-medium truncate max-w-[120px]">{user?.full_name}</div>
              <div className="text-white/30 text-xs">Teacher</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">

          {/* ══ LIVE ══ */}
          {tab === 'live' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="font-display text-3xl font-bold text-white">Live Classroom</h1>
                  <p className="text-white/40 text-sm mt-1">{onlineStudents.length} student{onlineStudents.length !== 1 ? 's' : ''} online now</p>
                </div>
                <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-sm font-medium">Live</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Online Now',      value: onlineStudents.length,          color: 'text-green-400'  },
                  { label: 'Total Students',  value: allStudents.length,             color: 'text-iris-400'   },
                  { label: 'Total Submitted', value: subCounts.total_submissions,    color: 'text-blue-400'   },
                  { label: 'Pending Review',  value: subCounts.pending_review_count, color: 'text-yellow-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="glass rounded-2xl p-4">
                    <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
                    <div className="text-white/40 text-xs mt-1">{label}</div>
                  </div>
                ))}
              </div>
              {onlineStudents.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                  <Users className="text-white/20 mx-auto mb-3" size={40} />
                  <p className="text-white/40">No students online yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {onlineStudents.map(s => (
                    <StudentCard key={s.socketId || s.userId} student={s}
                      onSettings={() => { setSelectedStudent(s); setShowSettings(true); }}
                      onRecalibrate={() => recalibrate(s.userId)} />
                  ))}
                </div>
              )}
              {allStudents.filter(s => !onlineStudents.find(o => o.userId === s.id)).length > 0 && (
                <div className="mt-6">
                  <h2 className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-3">Offline Students</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {allStudents.filter(s => !onlineStudents.find(o => o.userId === s.id)).map(s => (
                      <div key={s.id} className="glass rounded-xl p-4 flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-white/60 text-sm font-medium truncate">{s.full_name}</div>
                          <div className="text-white/30 text-xs truncate">{s.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ══ ASSIGNMENTS ══ */}
          {tab === 'assignments' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-3xl font-bold text-white">Assignments</h1>
                <button onClick={() => setShowNewAssignment(true)}
                  className="flex items-center gap-2 bg-iris-600 hover:bg-iris-500 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all">
                  <Plus size={16} /> New Assignment
                </button>
              </div>
              <div className="space-y-3">
                {assignments.length === 0 && (
                  <div className="glass rounded-2xl p-12 text-center">
                    <BookOpen className="text-white/20 mx-auto mb-3" size={40} />
                    <p className="text-white/40">No assignments yet. Create one to get started.</p>
                  </div>
                )}
                {assignments.map(a => {
                  const asgSubs   = submissions.filter(s => s.assignment_id === a.id);
                  const reviewed  = asgSubs.filter(s => s.status === 'reviewed').length;
                  return (
                    <div key={a.id} className="glass rounded-2xl p-5 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-white">{a.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.is_published ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                            {a.is_published ? 'Published' : 'Draft'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-iris-500/20 text-iris-300 capitalize">{a.difficulty}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-300">{a.total_marks || 10} marks</span>
                        </div>
                        <p className="text-white/40 text-sm truncate">{a.content}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-white/30">
                          <span>{asgSubs.length} submitted</span>
                          <span>{reviewed} reviewed</span>
                          <span>{new Date(a.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => togglePublish(a.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                            ${a.is_published ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}>
                          {a.is_published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button onClick={() => deleteAssignment(a.id)}
                          className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ══ SUBMISSIONS ══ */}
          {tab === 'submissions' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="font-display text-3xl font-bold text-white">Submissions</h1>
                  <p className="text-white/40 text-sm mt-1">
                    {subCounts.total_submissions} total · {subCounts.reviewed_count} reviewed · {subCounts.pending_review_count} awaiting review
                  </p>
                </div>
                <button onClick={loadAll} className="glass p-2.5 rounded-xl text-white/50 hover:text-white transition-colors">
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {submissions.length === 0 ? (
                  <div className="glass rounded-2xl p-12 text-center">
                    <Send className="text-white/20 mx-auto mb-3" size={40} />
                    <p className="text-white/40">No submissions yet</p>
                    <p className="text-white/20 text-sm mt-1">Students need to submit their answers first</p>
                  </div>
                ) : (
                  submissions.map(s => {
                    const status = s.status || (s.graded_at ? 'reviewed' : 'submitted');
                    return (
                      <div key={s.id}
                        className={`glass rounded-2xl p-5 border transition-all cursor-pointer hover:border-iris-500/30
                          ${status === 'reviewed' ? 'border-green-500/15' : 'border-white/5'}`}
                        onClick={() => openGradeModal(s)}>
                        <div className="flex items-start justify-between mb-3 gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ backgroundColor: s.avatar_color || '#6366f1' }}>
                              {(s.full_name || 'S')[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-white">{s.full_name || 'Student'}</div>
                              <div className="text-white/30 text-xs">
                                {s.assignment_title && <span className="mr-2">{s.assignment_title}</span>}
                                {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : new Date(s.updated_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                            {s.wpm > 0 && <span className="text-xs text-iris-300 glass px-2 py-1 rounded-lg">{s.wpm} WPM</span>}
                            <StatusBadge status={status} />
                            {s.marks !== null && s.marks !== undefined && (
                              <span className="text-xs px-2 py-1 rounded-lg bg-yellow-500/20 text-yellow-300 flex items-center gap-1">
                                <Star size={10} className="fill-yellow-400 text-yellow-400" />
                                {s.marks}/{s.total_marks ?? s.assignment_total_marks ?? 10}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 font-mono text-sm text-white/70 mb-3 line-clamp-2">
                          {s.answer_text ? (s.answer_text.length > 160 ? s.answer_text.slice(0, 160) + '…' : s.answer_text) : <span className="italic text-white/30">Empty</span>}
                        </div>
                        {s.feedback && (
                          <div className="text-xs text-iris-300 mb-2 flex items-center gap-1">
                            <MessageSquare size={12} />{s.feedback.slice(0, 80)}{s.feedback.length > 80 ? '…' : ''}
                          </div>
                        )}
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                          ${status === 'reviewed' ? 'glass text-white/60 border border-white/10' : 'bg-iris-600 text-white hover:bg-iris-500'}`}
                          onClick={e => { e.stopPropagation(); openGradeModal(s); }}>
                          <Star size={12} />{status === 'reviewed' ? 'Edit Review' : 'Review & Grade'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* ══ ANALYTICS ══ */}
          {tab === 'analytics' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h1 className="font-display text-3xl font-bold text-white mb-6">Analytics</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {analytics.length === 0 && (
                  <div className="col-span-2 glass rounded-2xl p-12 text-center">
                    <BarChart3 className="text-white/20 mx-auto mb-3" size={40} />
                    <p className="text-white/40">No analytics yet.</p>
                  </div>
                )}
                {analytics.map(s => (
                  <div key={s.id} className="glass rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ backgroundColor: s.avatar_color || '#6366f1' }}>
                        {(s.full_name || 'S')[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{s.full_name}</div>
                        <div className="text-white/40 text-xs">{s.total_sessions || 0} sessions</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Avg WPM',     value: s.avg_wpm || '—' },
                        { label: 'Accuracy',    value: s.avg_accuracy ? `${s.avg_accuracy}%` : '—' },
                        { label: 'Last Active', value: s.last_active ? new Date(s.last_active).toLocaleDateString() : 'Never' },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
                          <div className="text-iris-300 font-bold font-display text-lg">{value}</div>
                          <div className="text-white/30 text-xs mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ══ NOTIFICATIONS ══ */}
          {tab === 'notifications' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-3xl font-bold text-white">Notifications</h1>
                {notifications.length > 0 && (
                  <button onClick={markAllRead}
                    className="glass px-4 py-2 rounded-xl text-iris-300 text-sm hover:text-white transition-colors">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {notifications.length === 0 && (
                  <div className="glass rounded-2xl p-12 text-center">
                    <Bell className="text-white/20 mx-auto mb-3" size={40} />
                    <p className="text-white/40">No unread notifications</p>
                  </div>
                )}
                <AnimatePresence>
                  {notifications.map(n => (
                    <motion.div key={n.id}
                      initial={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2 }}
                      className="glass rounded-xl p-4 flex items-center gap-3 border border-iris-500/20 bg-iris-500/5">
                      <Bell size={16} className="text-iris-400 shrink-0" />
                      <div className="flex-1">
                        <div className="text-white/80 text-sm font-medium">{n.title}</div>
                        <div className="text-white/40 text-xs">{n.message} · {new Date(n.created_at).toLocaleString()}</div>
                      </div>
                      <button onClick={() => markRead(n.id)}
                        className="text-xs text-iris-400 hover:text-white glass px-3 py-1 rounded-lg transition-colors shrink-0">
                        ✓ Dismiss
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* ═══ MODALS ═══ */}
      <AnimatePresence>

        {/* New Assignment */}
        {showNewAssignment && (
          <Modal title="New Assignment" onClose={() => setShowNewAssignment(false)}>
            <div className="space-y-4">
              <input value={newAssignment.title} onChange={e => setNewAssignment(a => ({ ...a, title: e.target.value }))}
                placeholder="Assignment title"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-iris-500/50" />
              <textarea value={newAssignment.content} onChange={e => setNewAssignment(a => ({ ...a, content: e.target.value }))}
                placeholder="Question or content for students…" rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-iris-500/50 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <select value={newAssignment.type} onChange={e => setNewAssignment(a => ({ ...a, type: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-iris-500/50">
                  <option value="sentence_typing">Sentence Typing</option>
                  <option value="paragraph_typing">Paragraph Typing</option>
                  <option value="vocabulary">Vocabulary</option>
                  <option value="communication">Communication</option>
                  <option value="exam">Exam</option>
                </select>
                <select value={newAssignment.difficulty} onChange={e => setNewAssignment(a => ({ ...a, difficulty: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-iris-500/50">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Total Marks</label>
                <input type="number" min={1} max={100} value={newAssignment.totalMarks}
                  onChange={e => setNewAssignment(a => ({ ...a, totalMarks: +e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-iris-500/50" />
              </div>
              <button onClick={createAssignment}
                className="w-full py-3 bg-iris-600 hover:bg-iris-500 rounded-xl font-semibold text-white transition-all">
                Create Assignment
              </button>
            </div>
          </Modal>
        )}

        {/* Settings */}
        {showSettings && selectedStudent && (
          <Modal title={`Settings — ${selectedStudent.name || selectedStudent.full_name || 'Student'}`} onClose={() => setShowSettings(false)}>
            <div className="space-y-4">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Dwell Time: {settingsForm.dwellTimeMs}ms</label>
                <input type="range" min={200} max={2000} step={50} value={settingsForm.dwellTimeMs}
                  onChange={e => setSettingsForm(f => ({ ...f, dwellTimeMs: +e.target.value }))} className="w-full accent-iris-500" />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Font Size: {settingsForm.fontSize}px</label>
                <input type="range" min={16} max={36} value={settingsForm.fontSize}
                  onChange={e => setSettingsForm(f => ({ ...f, fontSize: +e.target.value }))} className="w-full accent-iris-500" />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Keyboard Size</label>
                <div className="flex gap-2">
                  {['small', 'medium', 'large'].map(s => (
                    <button key={s} onClick={() => setSettingsForm(f => ({ ...f, keyboardSize: s }))}
                      className={`flex-1 py-2 rounded-lg text-sm capitalize transition-all ${settingsForm.keyboardSize === s ? 'bg-iris-600 text-white' : 'bg-white/5 text-white/50'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-white/50 text-xs uppercase tracking-wider">High Contrast</label>
                <button onClick={() => setSettingsForm(f => ({ ...f, highContrast: !f.highContrast }))}
                  className={`w-11 h-6 rounded-full transition-all relative ${settingsForm.highContrast ? 'bg-iris-600' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${settingsForm.highContrast ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Highlight Color</label>
                <input type="color" value={settingsForm.highlightColor}
                  onChange={e => setSettingsForm(f => ({ ...f, highlightColor: e.target.value }))}
                  className="w-full h-10 rounded-lg cursor-pointer bg-transparent border border-white/10" />
              </div>
              <div className="flex gap-2">
                <button onClick={sendSettings} className="flex-1 py-3 bg-iris-600 hover:bg-iris-500 rounded-xl font-semibold text-white transition-all">Apply Settings</button>
                <button onClick={() => { recalibrate(selectedStudent.userId || selectedStudent.id); setShowSettings(false); }}
                  className="flex-1 py-3 glass rounded-xl font-semibold text-white/70 hover:text-white transition-all border border-white/10">Recalibrate</button>
              </div>
            </div>
          </Modal>
        )}

        {/* Grade Modal */}
        {showGradeModal && selectedSubmission && (
          <Modal title={`Review — ${selectedSubmission.full_name}`} onClose={() => setShowGradeModal(false)}>
            <div className="space-y-4">
              {selectedSubmission.assignment_title && (
                <div className="glass rounded-xl px-4 py-2">
                  <p className="text-white/40 text-xs">Assignment</p>
                  <p className="text-white text-sm font-medium">{selectedSubmission.assignment_title}</p>
                </div>
              )}
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Student's Answer</p>
                <div className="bg-white/5 rounded-xl p-3 font-mono text-sm text-white/80 max-h-36 overflow-y-auto">
                  {selectedSubmission.answer_text || <span className="italic text-white/30">Empty</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/30 flex-wrap">
                {selectedSubmission.submitted_at && <span>Submitted: {new Date(selectedSubmission.submitted_at).toLocaleString()}</span>}
                {selectedSubmission.wpm > 0 && <span>{selectedSubmission.wpm} WPM</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Marks *</label>
                  <input type="number" min={0} max={gradeForm.totalMarks} value={gradeForm.marks}
                    onChange={e => setGradeForm(f => ({ ...f, marks: e.target.value }))} placeholder="e.g. 8"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-iris-500/50" />
                </div>
                <div>
                  <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Out of</label>
                  <input type="number" min={1} max={100} value={gradeForm.totalMarks}
                    onChange={e => setGradeForm(f => ({ ...f, totalMarks: +e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-iris-500/50" />
                </div>
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Feedback (shown to student)</label>
                <textarea value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))}
                  placeholder="Great effort! Keep practising…" rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-iris-500/50 resize-none" />
              </div>
              <div>
                <label className="text-yellow-400/70 text-xs uppercase tracking-wider block mb-2">Correction (optional)</label>
                <textarea value={gradeForm.correction} onChange={e => setGradeForm(f => ({ ...f, correction: e.target.value }))}
                  placeholder="The correct answer should be…" rows={2}
                  className="w-full bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-yellow-500/40 resize-none" />
              </div>
              <button onClick={submitGrade}
                className="w-full py-3.5 bg-iris-600 hover:bg-iris-500 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2">
                <CheckCircle size={18} /> Send Review to Student
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function StudentCard({ student, onSettings, onRecalibrate }) {
  const sessionMins = Math.round((Date.now() - (student.connectedAt || Date.now())) / 60000);
  const dotColor    = student.status === 'active' ? '#22c55e' : student.status === 'idle' ? '#f59e0b' : '#ef4444';
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-5 border border-white/5 hover:border-iris-500/20 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
          <div>
            <div className="font-semibold text-white">{student.name}</div>
            <div className="text-white/30 text-xs">{student.status === 'active' ? 'Active' : student.status === 'idle' ? 'Idle' : 'Away'} · {sessionMins}m session</div>
          </div>
        </div>
        <button onClick={onSettings} className="p-2 rounded-xl glass text-white/40 hover:text-iris-400 transition-colors">
          <Sliders size={14} />
        </button>
      </div>
      <div className="bg-white/5 rounded-xl p-3 mb-3 font-mono text-sm text-white/70 truncate min-h-9">
        {student.typingProgress || <span className="text-white/20 italic">Not typing yet</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[{ label: 'WPM', value: student.wpm || 0 }, { label: 'Gaze %', value: `${student.gazeConfidence || 0}%` }, { label: 'Session', value: `${sessionMins}m` }].map(({ label, value }) => (
          <div key={label} className="bg-white/5 rounded-lg p-2 text-center">
            <div className="text-iris-300 font-bold text-sm font-display">{value}</div>
            <div className="text-white/30 text-xs">{label}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} className="glass rounded-2xl p-6 w-full max-w-md my-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-white text-lg">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all"><X size={16} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}