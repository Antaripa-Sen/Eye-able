import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Users, BookOpen, Bell, LogOut, Plus, RefreshCw, Trash2,
  Wifi, BarChart3, X, Send, Sliders, Star, CheckCircle, MessageSquare,
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { connectSocket, getSocket } from '../services/socket';
import { toast } from '../components/ui/Toast';

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'Pending',   cls: 'bg-[#f5c842]/20 text-[#f5c842] border-[#f5c842]/30' },
    submitted: { label: 'Submitted', cls: 'bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8]/30' },
    reviewed:  { label: 'Reviewed',  cls: 'bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/30' },
  };
  const cfg = map[status] || { label: status || '—', cls: 'bg-white/10 text-white/50 border-white/10' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border-2 ${cfg.cls}`}>
      <span className="w-2 h-2 rounded-full bg-current" />{cfg.label}
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
  const [settingsForm,  setSettingsForm]  = useState({ dwellTimeMs: 1000, keyboardSize: 'large', fontSize: 32, highContrast: false, highlightColor: '#f5c842' });
  const [gradeForm,     setGradeForm]     = useState({ marks: '', totalMarks: 10, feedback: '', correction: '' });

  useEffect(() => {
    document.querySelectorAll('video').forEach(v => {
      try { if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; } } catch (_) {}
    });
    try { if (window.webgazer?.end) window.webgazer.end(); } catch (_) {}
  }, []);

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
      if (notifRes.ok)  setNotifications(await notifRes.json()); 
      if (analyRes.ok)  setAnalytics(await analyRes.json());
      if (countsRes.ok) setSubCounts(await countsRes.json());
    } catch (_) {}
  }, [authFetch]);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 15000);
    return () => clearInterval(iv);
  }, [loadAll]);

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

  const openGradeModal = (sub) => {
    setSelectedSubmission(sub);
    setGradeForm({ marks: sub.marks ?? '', totalMarks: sub.total_marks ?? sub.assignment_total_marks ?? 10, feedback: sub.feedback ?? '', correction: sub.correction ?? '' });
    setShowGradeModal(true);
  };

  const submitGrade = async () => {
    if (!selectedSubmission) return toast.error('No submission selected');
    if (gradeForm.marks === '') return toast.error('Enter marks');
    const marks = Number(gradeForm.marks);
    if (isNaN(marks) || marks < 0) return toast.error('Invalid marks');
    if (marks > gradeForm.totalMarks) return toast.error(`Cannot exceed ${gradeForm.totalMarks}`);
    const submissionId = selectedSubmission.id || selectedSubmission.submission_id;
    if (!submissionId) return toast.error('Submission ID missing');
    try {
      const res = await authFetch(`/submissions/${submissionId}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({ marks, totalMarks: gradeForm.totalMarks, feedback: gradeForm.feedback || null, correction: gradeForm.correction || null }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        return toast.error(errBody?.error || 'Failed to grade submission');
      }
      toast.success(`✅ Marks sent to ${selectedSubmission.full_name || selectedSubmission.name || 'student'}`);
      setShowGradeModal(false);
      setSubmissions(prev => prev.map(s => s.id === submissionId
        ? { ...s, marks, total_marks: gradeForm.totalMarks, feedback: gradeForm.feedback, correction: gradeForm.correction, graded_at: new Date().toISOString(), status: 'reviewed' }
        : s
      ));
      setSubCounts(c => ({ ...c, reviewed_count: +c.reviewed_count + 1, pending_review_count: Math.max(0, +c.pending_review_count - 1) }));
    } catch { toast.error('Grading failed'); }
  };

  const sendSettings = async () => {
    if (!selectedStudent) return;
    try {
      await authFetch(`/settings/${selectedStudent.id || selectedStudent.userId}`, { method: 'PATCH', body: JSON.stringify(settingsForm) });
      getSocket()?.emit('teacher:updateSettings', { studentId: selectedStudent.id || selectedStudent.userId, settings: settingsForm });
      toast.success('Settings sent'); setShowSettings(false);
    } catch { toast.error('Failed'); }
  };

  const recalibrate = (studentId) => { getSocket()?.emit('teacher:recalibrate', { studentId }); toast.info('Recalibration request sent'); };

  const removeStudent = async (studentId) => {
    if (!studentId) return toast.error('Student id missing');
    if (!confirm('Remove this student from the class?')) return;
    try {
      const res = await authFetch(`/users/students/${studentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        return toast.error(errBody?.error || 'Unable to remove student');
      }
      setOnlineStudents(prev => prev.filter(s => (s.userId || s.id) !== studentId));
      setAllStudents(prev => prev.filter(s => s.id !== studentId));
      toast.success('Student removed from class');
      setShowSettings(false);
    } catch {
      toast.error('Remove failed');
    }
  };

  const markRead = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id)); 
    await authFetch(`/users/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifications([]); 
    await authFetch('/users/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const tabs = [
    { id: 'live',          label: 'Live Classroom',                                              icon: Wifi     },
    { id: 'assignments',   label: 'Assignments',                                                 icon: BookOpen },
    { id: 'submissions',   label: `Submissions (${subCounts.total_submissions || 0})`,           icon: Send     },
    { id: 'analytics',     label: 'Analytics',                                                   icon: BarChart3 },
    { id: 'notifications', label: `Alerts${notifications.length > 0 ? ` (${notifications.length})` : ''}`, icon: Bell },
  ];

  return (
    <div className="h-screen w-screen bg-[#1a1040] flex overflow-hidden text-white font-sans">

      {/* Sidebar Command Center */}
      <aside className="w-80 bg-[#2a1f5c] border-r-4 border-[#1a1040] flex flex-col shrink-0 z-20 rounded-r-[2rem] shadow-2xl">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 60" width="50" height="30">
              <path d="M 0 30 Q 50 0 100 30 Q 50 60 0 30" fill="white" />
              <circle cx="50" cy="30" r="16" fill="#38bdf8" />
              <circle cx="50" cy="30" r="10" fill="#1e3a8a" />
              <circle cx="50" cy="30" r="6" fill="#1a1040" />
              <circle cx="45" cy="25" r="3" fill="white" opacity="0.8" />
            </svg>
            <div>
              <div className="font-black text-2xl tracking-wide">Able</div>
              <div className="text-[#f5c842] font-bold text-sm">Teacher Portal</div>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-3xl text-lg font-black transition-all
                ${tab === id ? 'bg-[#f5c842] text-[#1a1040] shadow-lg' : 'text-white/50 hover:text-white hover:bg-white/10'}`}>
              <Icon size={24} />{label}
            </button>
          ))}
        </nav>
        
        <div className="p-6 bg-[#1a1040] m-4 rounded-[2rem]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-[#1a1040] text-xl font-black bg-[#f28c6e]">
              {user?.full_name?.[0] || 'T'}
            </div>
            <div className="overflow-hidden">
              <div className="font-bold truncate">{user?.full_name}</div>
              <div className="text-white/40 text-sm">Teacher</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-500/20 text-rose-300 font-bold hover:bg-rose-500 hover:text-white transition-all">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Internal Scrollable Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden p-8">
        <div className="flex-1 overflow-y-auto pr-4 scrollbar-hide space-y-8">

          {/* ══ LIVE ══ */}
          {tab === 'live' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-black text-white">Live Session</h1>
                  <p className="text-[#f5c842] font-bold mt-2 text-lg">{onlineStudents.length} explorers online</p>
                </div>
                <div className="flex items-center gap-3 bg-[#2a1f5c] px-6 py-3 rounded-full border-2 border-[#1a1040]">
                  <div className="w-4 h-4 rounded-full bg-[#00FF00] animate-pulse shadow-[0_0_10px_#00FF00]" />
                  <span className="text-[#00FF00] font-black tracking-widest uppercase">System Online</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
                {(() => {
                  const totalStudentsCount = Math.max(allStudents.length, onlineStudents.length);
                  return [
                    { label: 'Online Now',      value: onlineStudents.length,          color: 'text-[#00FF00]' },
                    { label: 'Total Students',  value: totalStudentsCount,             color: 'text-[#38bdf8]' },
                    { label: 'Submissions',     value: subCounts.total_submissions,    color: 'text-[#f5c842]' },
                    { label: 'To Review',       value: subCounts.pending_review_count, color: 'text-[#f28c6e]' },
                  ];
                })().map(({ label, value, color }) => (
                  <div key={label} className="bg-[#2a1f5c] rounded-[2rem] p-6 border-4 border-[#1a1040]">
                    <div className={`text-5xl font-black ${color}`}>{value}</div>
                    <div className="text-white/60 font-bold mt-2 uppercase tracking-wider text-sm">{label}</div>
                  </div>
                ))}
              </div>
              
              {onlineStudents.length === 0 ? (
                <div className="bg-[#2a1f5c] rounded-[3rem] p-16 text-center border-4 border-[#1a1040]">
                  <Users className="text-white/20 mx-auto mb-4" size={64} />
                  <p className="text-2xl font-bold text-white/40">Waiting for students to connect...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {onlineStudents.map(s => (
                    <StudentCard key={s.socketId || s.userId} student={s}
                      onSettings={() => { setSelectedStudent(s); setShowSettings(true); }}
                      onRecalibrate={() => recalibrate(s.userId)}
                      onRemove={() => removeStudent(s.userId || s.id)} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ══ ASSIGNMENTS ══ */}
          {tab === 'assignments' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-8">
                <h1 className="text-4xl font-black text-white">Tasks & Activities</h1>
                <button onClick={() => setShowNewAssignment(true)}
                  className="flex items-center gap-3 bg-[#f5c842] hover:bg-white px-8 py-4 rounded-full text-lg font-black text-[#1a1040] transition-all shadow-lg">
                  <Plus size={24} /> New Task
                </button>
              </div>
              <div className="space-y-6">
                {assignments.length === 0 && (
                  <div className="bg-[#2a1f5c] rounded-[3rem] p-16 text-center border-4 border-[#1a1040]">
                    <BookOpen className="text-white/20 mx-auto mb-4" size={64} />
                    <p className="text-2xl font-bold text-white/40">No tasks created yet.</p>
                  </div>
                )}
                {assignments.map(a => {
                  return (
                    <div key={a.id} className="bg-[#2a1f5c] rounded-[2rem] p-8 flex items-center gap-6 border-4 border-[#1a1040]">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-3">
                          <h3 className="text-2xl font-black text-white">{a.title}</h3>
                          <span className={`px-4 py-1 rounded-full text-sm font-bold uppercase ${a.is_published ? 'bg-[#22c55e] text-[#1a1040]' : 'bg-[#1a1040] text-white/50'}`}>
                            {a.is_published ? 'Live' : 'Draft'}
                          </span>
                          <span className="px-4 py-1 rounded-full text-sm font-bold uppercase bg-[#f5c842]/20 text-[#f5c842]">{a.total_marks || 10} pts</span>
                        </div>
                        <p className="text-white/60 text-lg mb-4">{a.content}</p>
                      </div>
                      <div className="flex flex-col gap-3 shrink-0">
                        <button onClick={() => togglePublish(a.id)}
                          className={`px-6 py-3 rounded-full font-black transition-all
                            ${a.is_published ? 'bg-[#1a1040] text-[#f5c842] hover:bg-[#f5c842] hover:text-[#1a1040]' : 'bg-[#38bdf8] text-[#1a1040] hover:bg-white'}`}>
                          {a.is_published ? 'Hide' : 'Publish'}
                        </button>
                        <button onClick={() => deleteAssignment(a.id)}
                          className="px-6 py-3 rounded-full bg-rose-500/20 text-rose-300 font-bold hover:bg-rose-500 hover:text-white transition-all">
                          Delete
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
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-black text-white">Incoming Work</h1>
                  <p className="text-[#f28c6e] font-bold mt-2 text-lg">{subCounts.pending_review_count} need your review</p>
                </div>
                <button onClick={loadAll} className="bg-[#2a1f5c] p-4 rounded-full border-4 border-[#1a1040] hover:bg-[#f5c842] hover:text-[#1a1040] transition-colors">
                  <RefreshCw size={24} />
                </button>
              </div>

              <div className="space-y-6">
                {submissions.length === 0 ? (
                  <div className="bg-[#2a1f5c] rounded-[3rem] p-16 text-center border-4 border-[#1a1040]">
                    <Send className="text-white/20 mx-auto mb-4" size={64} />
                    <p className="text-2xl font-bold text-white/40">Inbox is empty</p>
                  </div>
                ) : (
                  submissions.map(s => {
                    const status = s.status || (s.graded_at ? 'reviewed' : 'submitted');
                    return (
                      <div key={s.id}
                        className={`bg-[#2a1f5c] rounded-[2rem] p-8 border-4 transition-all cursor-pointer hover:scale-[1.01]
                          ${status === 'reviewed' ? 'border-[#22c55e]/50' : 'border-[#f28c6e]'}`}
                        onClick={() => openGradeModal(s)}>
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                             <div className="w-14 h-14 rounded-full bg-[#38bdf8] text-[#1a1040] flex items-center justify-center font-black text-2xl">
                               {(s.full_name || 'S')[0]}
                             </div>
                             <div>
                                <h3 className="font-black text-2xl">{s.full_name || 'Student'}</h3>
                                <p className="text-white/50 font-bold">{s.assignment_title}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={status} />
                            {s.marks !== null && (
                              <span className="px-4 py-2 rounded-full bg-[#f5c842] text-[#1a1040] font-black flex items-center gap-2">
                                <Star size={16} className="fill-[#1a1040]" /> {s.marks}/{s.total_marks ?? 10}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="bg-[#1a1040] rounded-[1.5rem] p-6 font-mono text-xl text-white mb-4">
                          {s.answer_text || <span className="italic text-white/30">Empty</span>}
                        </div>
                        <button className="text-[#f5c842] font-black text-lg flex items-center gap-2 hover:text-white transition-colors">
                           <CheckCircle size={20}/> {status === 'reviewed' ? 'Edit Grades' : 'Grade Now'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* ══ ANALYTICS ══ */}
          {tab === 'analytics' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-4xl font-black text-white mb-8">Performance</h1>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {analytics.map(s => (
                  <div key={s.id} className="bg-[#2a1f5c] rounded-[2rem] p-8 border-4 border-[#1a1040]">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-16 h-16 rounded-full bg-[#f5c842] text-[#1a1040] flex items-center justify-center font-black text-3xl">
                        {(s.full_name || 'S')[0]}
                      </div>
                      <div>
                        <h3 className="font-black text-2xl">{s.full_name}</h3>
                        <p className="text-white/50 font-bold">{s.total_sessions || 0} active sessions</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: 'Avg WPM',  value: s.avg_wpm || '0' },
                        { label: 'Accuracy', value: s.avg_accuracy ? `${s.avg_accuracy}%` : '0%' },
                        { label: 'Last Seen',value: s.last_active ? new Date(s.last_active).toLocaleDateString() : 'N/A' },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-[#1a1040] rounded-2xl p-4 text-center">
                          <div className="text-[#38bdf8] font-black text-2xl mb-1">{value}</div>
                          <div className="text-white/40 font-bold text-xs uppercase tracking-wider">{label}</div>
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
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-8">
                <h1 className="text-4xl font-black text-white">System Alerts</h1>
                {notifications.length > 0 && (
                  <button onClick={markAllRead} className="bg-[#f28c6e] hover:bg-white text-[#1a1040] px-6 py-3 rounded-full font-black transition-colors">
                    Clear All
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {notifications.length === 0 && (
                  <div className="bg-[#2a1f5c] rounded-[3rem] p-16 text-center border-4 border-[#1a1040]">
                    <Bell className="text-white/20 mx-auto mb-4" size={64} />
                    <p className="text-2xl font-bold text-white/40">All caught up!</p>
                  </div>
                )}
                <AnimatePresence>
                  {notifications.map(n => (
                    <motion.div key={n.id}
                      initial={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      className="bg-[#2a1f5c] border-l-8 border-[#f5c842] rounded-2xl p-6 flex items-center justify-between gap-6 overflow-hidden">
                      <div>
                        <h4 className="text-xl font-black text-white mb-1">{n.title}</h4>
                        <p className="text-white/60 font-bold">{n.message}</p>
                      </div>
                      <button onClick={() => markRead(n.id)} className="bg-[#1a1040] text-white/50 hover:text-white px-6 py-3 rounded-full font-bold whitespace-nowrap">
                        Dismiss
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
          <Modal title="Create New Task" onClose={() => setShowNewAssignment(false)}>
            <div className="space-y-6">
              <input value={newAssignment.title} onChange={e => setNewAssignment(a => ({ ...a, title: e.target.value }))}
                placeholder="Task Title" className="w-full bg-[#1a1040] rounded-[2rem] px-6 py-4 text-xl font-bold text-white focus:outline-none focus:ring-4 focus:ring-[#f5c842]" />
              <textarea value={newAssignment.content} onChange={e => setNewAssignment(a => ({ ...a, content: e.target.value }))}
                placeholder="What should the student type?" rows={4}
                className="w-full bg-[#1a1040] rounded-[2rem] px-6 py-4 text-xl font-bold text-white focus:outline-none focus:ring-4 focus:ring-[#f5c842] resize-none" />
              <div className="grid grid-cols-2 gap-4">
                <select value={newAssignment.type} onChange={e => setNewAssignment(a => ({ ...a, type: e.target.value }))}
                  className="bg-[#1a1040] rounded-full px-6 py-4 font-bold text-white focus:outline-none focus:ring-4 focus:ring-[#f5c842] appearance-none">
                  <option value="sentence_typing">Sentence Typing</option>
                  <option value="paragraph_typing">Paragraph Typing</option>
                </select>
                <select value={newAssignment.difficulty} onChange={e => setNewAssignment(a => ({ ...a, difficulty: e.target.value }))}
                  className="bg-[#1a1040] rounded-full px-6 py-4 font-bold text-white focus:outline-none focus:ring-4 focus:ring-[#f5c842] appearance-none">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <input type="number" value={newAssignment.totalMarks} onChange={e => setNewAssignment(a => ({ ...a, totalMarks: +e.target.value }))}
                placeholder="Total Points" className="w-full bg-[#1a1040] rounded-full px-6 py-4 text-xl font-bold text-white focus:outline-none focus:ring-4 focus:ring-[#f5c842]" />
              <button onClick={createAssignment} className="w-full py-5 bg-[#f5c842] hover:bg-white text-[#1a1040] rounded-full font-black text-2xl transition-all shadow-lg">
                Publish Task
              </button>
            </div>
          </Modal>
        )}

        {/* Student Settings */}
        {showSettings && selectedStudent && (
          <Modal title={`Settings for ${selectedStudent.name || 'Student'}`} onClose={() => setShowSettings(false)}>
            <div className="space-y-8">
              <div>
                <label className="text-white font-bold text-xl block mb-4">Dwell Time: {settingsForm.dwellTimeMs}ms</label>
                <input type="range" min={400} max={2500} step={100} value={settingsForm.dwellTimeMs}
                  onChange={e => setSettingsForm(f => ({ ...f, dwellTimeMs: +e.target.value }))} className="w-full h-4 bg-[#1a1040] rounded-lg appearance-none cursor-pointer accent-[#f5c842]" />
              </div>
              <div className="flex gap-4">
                <button onClick={sendSettings} className="flex-[2] py-4 bg-[#f5c842] text-[#1a1040] rounded-full font-black text-xl hover:bg-white transition-all shadow-lg">Push Settings</button>
                <button onClick={() => { recalibrate(selectedStudent.userId || selectedStudent.id); setShowSettings(false); }}
                  className="flex-1 py-4 bg-[#f28c6e] text-[#1a1040] rounded-full font-black text-xl hover:bg-white transition-all shadow-lg">Calibrate</button>
              </div>
            </div>
          </Modal>
        )}

        {/* Grade Modal */}
        {showGradeModal && selectedSubmission && (
          <Modal title={`Grade: ${selectedSubmission.full_name}`} onClose={() => setShowGradeModal(false)}>
            <div className="space-y-6">
              <div className="bg-[#1a1040] rounded-[2rem] p-6 font-mono text-xl text-white">
                {selectedSubmission.answer_text}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Marks" value={gradeForm.marks} onChange={e => setGradeForm(f => ({ ...f, marks: e.target.value }))}
                  className="bg-[#1a1040] rounded-full px-6 py-4 font-black text-2xl text-center text-white focus:outline-none focus:ring-4 focus:ring-[#f5c842]" />
                <div className="bg-[#1a1040] rounded-full px-6 py-4 font-black text-2xl text-center text-white/50">
                  / {gradeForm.totalMarks}
                </div>
              </div>
              <textarea placeholder="Great effort..." value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} rows={2}
                className="w-full bg-[#1a1040] rounded-[2rem] px-6 py-4 text-xl font-bold text-white focus:outline-none focus:ring-4 focus:ring-[#f5c842] resize-none" />
              <button onClick={submitGrade} className="w-full py-5 bg-[#22c55e] text-[#1a1040] rounded-full font-black text-2xl hover:bg-white transition-all shadow-lg flex justify-center items-center gap-3">
                 <CheckCircle size={28}/> Save Grades
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-components mapped to new styling
function StudentCard({ student, onSettings, onRecalibrate, onRemove }) {
  const dotColor = student.status === 'active' ? '#00FF00' : student.status === 'idle' ? '#f5c842' : '#f28c6e';
  return (
    <div className="bg-[#2a1f5c] rounded-[2rem] p-6 border-4 border-[#1a1040]">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: dotColor, boxShadow: `0 0 10px ${dotColor}` }} />
          <h3 className="font-black text-2xl text-white">{student.name || student.full_name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSettings} className="bg-[#1a1040] p-3 rounded-full text-white/50 hover:text-[#f5c842] transition-colors">
            <Sliders size={20} />
          </button>
          {onRemove && (
            <button onClick={onRemove} className="bg-[#1a1040] p-3 rounded-full text-white/50 hover:text-rose-400 transition-colors">
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>
      <div className="bg-[#1a1040] rounded-[1.5rem] p-4 font-mono text-lg text-white/80 h-20 overflow-hidden mb-6">
        {student.typingProgress || <span className="text-white/20 italic">Awaiting text...</span>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#1a1040] rounded-2xl py-3 text-center">
           <div className="font-black text-[#38bdf8] text-2xl">{student.wpm || 0}</div>
           <div className="font-bold text-white/40 text-xs uppercase">WPM</div>
        </div>
        <div className="bg-[#1a1040] rounded-2xl py-3 text-center">
           <div className="font-black text-[#f5c842] text-2xl">{student.gazeConfidence || 0}%</div>
           <div className="font-bold text-white/40 text-xs uppercase">Gaze</div>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#1a1040]/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} 
        className="bg-[#2a1f5c] border-4 border-[#1a1040] rounded-[3rem] p-10 w-full max-w-xl shadow-2xl">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-black text-white text-3xl">{title}</h2>
          <button onClick={onClose} className="bg-[#1a1040] p-4 rounded-full text-white/50 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}