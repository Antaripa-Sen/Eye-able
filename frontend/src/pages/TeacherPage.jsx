import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Eye, Users, BookOpen, Bell, LogOut, Plus, RefreshCw, Trash2, ChevronRight, Wifi, Activity, Clock, Search, Settings, BarChart3, X, Send, Sliders } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import useAuthStore from '../store/authStore';
import { connectSocket, getSocket } from '../services/socket';
import { toast } from '../components/ui/Toast';

export default function TeacherPage() {
  const { user, token, logout, authFetch } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState('live');
  const [onlineStudents, setOnlineStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [search, setSearch] = useState('');
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ title: '', content: '', type: 'sentence_typing', difficulty: 'medium' });
  const [settingsForm, setSettingsForm] = useState({ dwellTimeMs: 500, keyboardSize: 'medium', fontSize: 24, highContrast: false, highlightColor: '#ffd700' });
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Load data
  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadAll = async () => {
    try {
      const [studRes, asgRes, subRes, notifRes, analyRes] = await Promise.all([
        authFetch('/users/students'),
        authFetch('/assignments'),
        authFetch('/submissions'),
        authFetch('/users/notifications'),
        authFetch('/analytics/students')
      ]);
      if (studRes.ok) setAllStudents(await studRes.json());
      if (asgRes.ok) setAssignments(await asgRes.json());
      if (subRes.ok) setSubmissions(await subRes.json());
      if (notifRes.ok) { const n = await notifRes.json(); setNotifications(n); setUnreadNotifs(n.filter(x => !x.is_read).length); }
      if (analyRes.ok) setAnalytics(await analyRes.json());
    } catch {}
  };

  // Socket
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    socket.on('students:online', (students) => setOnlineStudents(students));
    socket.on('student:online', (s) => setOnlineStudents(prev => {
      const exists = prev.find(x => x.userId === s.userId);
      if (exists) return prev.map(x => x.userId === s.userId ? s : x);
      return [...prev, s];
    }));
    socket.on('student:update', (s) => setOnlineStudents(prev => prev.map(x => x.userId === s.userId ? s : x)));
    socket.on('student:offline', ({ userId }) => setOnlineStudents(prev => prev.filter(x => x.userId !== userId)));
    socket.on('notification:new', (n) => { toast.info(n.title + ': ' + n.message); setUnreadNotifs(u => u + 1); });

    return () => { socket.off('students:online'); socket.off('student:online'); socket.off('student:update'); socket.off('student:offline'); socket.off('notification:new'); };
  }, [token]);

  const createAssignment = async () => {
    if (!newAssignment.title || !newAssignment.content) return toast.error('Title and content required');
    try {
      const res = await authFetch('/assignments', { method: 'POST', body: JSON.stringify(newAssignment) });
      if (!res.ok) return toast.error('Failed to create assignment');
      toast.success('Assignment created!');
      setShowNewAssignment(false);
      setNewAssignment({ title: '', content: '', type: 'sentence_typing', difficulty: 'medium' });
      loadAll();
    } catch { toast.error('Error creating assignment'); }
  };

  const togglePublish = async (id) => {
    await authFetch(`/assignments/${id}/publish`, { method: 'PATCH' });
    loadAll();
  };

  const deleteAssignment = async (id) => {
    if (!confirm('Delete this assignment?')) return;
    await authFetch(`/assignments/${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    loadAll();
  };

  const sendSettings = async () => {
    if (!selectedStudent) return;
    try {
      await authFetch(`/settings/${selectedStudent.id || selectedStudent.userId}`, {
        method: 'PATCH',
        body: JSON.stringify(settingsForm)
      });
      getSocket()?.emit('teacher:updateSettings', {
        studentId: selectedStudent.id || selectedStudent.userId,
        settings: settingsForm
      });
      toast.success('Settings sent to student');
      setShowSettings(false);
    } catch { toast.error('Failed to send settings'); }
  };

  const recalibrate = (studentId) => {
    getSocket()?.emit('teacher:recalibrate', { studentId });
    toast.info('Recalibration request sent');
  };

  const tabs = [
    { id: 'live', label: 'Live Classroom', icon: Wifi },
    { id: 'assignments', label: 'Assignments', icon: BookOpen },
    { id: 'submissions', label: 'Submissions', icon: Send },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'notifications', label: `Notifications${unreadNotifs > 0 ? ` (${unreadNotifs})` : ''}`, icon: Bell },
  ];

  const filteredStudents = allStudents.filter(s =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleLogout = () => { logout(); navigate('/'); };

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

        <nav className="flex-1 p-4 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === id ? 'bg-iris-600/30 text-iris-300 border border-iris-500/20' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}>
              <Icon size={16} />
              {label}
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
              <div className="text-white/80 text-xs font-medium">{user?.full_name}</div>
              <div className="text-white/30 text-xs">Teacher</div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">

          {/* LIVE TAB */}
          {tab === 'live' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="font-display text-3xl font-bold text-white">Live Classroom</h1>
                  <p className="text-white/40 text-sm mt-1">{onlineStudents.length} students online now</p>
                </div>
                <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-sm font-medium">Live</span>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Online', value: onlineStudents.length, color: 'text-green-400' },
                  { label: 'Idle', value: onlineStudents.filter(s => s.status === 'idle').length, color: 'text-yellow-400' },
                  { label: 'Total Students', value: allStudents.length, color: 'text-iris-400' },
                  { label: 'Submissions Today', value: submissions.filter(s => new Date(s.updated_at) > new Date(Date.now() - 86400000)).length, color: 'text-blue-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="glass rounded-2xl p-4">
                    <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
                    <div className="text-white/40 text-xs mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {/* Online students grid */}
              {onlineStudents.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                  <Users className="text-white/20 mx-auto mb-3" size={40} />
                  <p className="text-white/40">No students are online yet</p>
                  <p className="text-white/20 text-sm mt-1">Students will appear here when they log in</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {onlineStudents.map((s) => (
                    <StudentCard key={s.socketId} student={s}
                      onSettings={() => { setSelectedStudent(s); setShowSettings(true); }}
                      onRecalibrate={() => recalibrate(s.userId)} />
                  ))}
                </div>
              )}

              {/* All students (offline view) */}
              {allStudents.filter(s => !onlineStudents.find(o => o.userId === s.id)).length > 0 && (
                <div className="mt-6">
                  <h2 className="font-display font-semibold text-white/60 text-sm mb-3 uppercase tracking-widest">Offline Students</h2>
                  <div className="grid grid-cols-3 gap-3">
                    {allStudents.filter(s => !onlineStudents.find(o => o.userId === s.id)).map(s => (
                      <div key={s.id} className="glass rounded-xl p-4 flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full status-dot-offline shrink-0" />
                        <div>
                          <div className="text-white/60 text-sm font-medium">{s.full_name}</div>
                          <div className="text-white/30 text-xs">{s.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ASSIGNMENTS TAB */}
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
                {assignments.map(a => (
                  <div key={a.id} className="glass rounded-2xl p-5 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white">{a.title}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.is_published ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                          {a.is_published ? 'Published' : 'Draft'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-iris-500/20 text-iris-300">{a.difficulty}</span>
                      </div>
                      <p className="text-white/40 text-sm truncate max-w-lg">{a.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-white/30">
                        <span>{a.student_count || 0} students</span>
                        <span>{a.submitted_count || 0} submitted</span>
                        <span>{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => togglePublish(a.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${a.is_published ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}>
                        {a.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button onClick={() => deleteAssignment(a.id)} className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* SUBMISSIONS TAB */}
          {tab === 'submissions' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-3xl font-bold text-white">Submissions</h1>
                <button onClick={loadAll} className="glass p-2 rounded-xl text-white/50 hover:text-white transition-colors">
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {submissions.length === 0 && (
                  <div className="glass rounded-2xl p-12 text-center">
                    <Send className="text-white/20 mx-auto mb-3" size={40} />
                    <p className="text-white/40">No submissions yet</p>
                  </div>
                )}
                {submissions.map(s => (
                  <div key={s.id} className="glass rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: s.avatar_color || '#6366f1' }}>
                          {(s.full_name || 'S')[0]}
                        </div>
                        <div>
                          <div className="font-medium text-white text-sm">{s.full_name || 'Student'}</div>
                          <div className="text-white/30 text-xs">{new Date(s.updated_at).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.wpm > 0 && <span className="text-xs text-iris-300 glass px-2 py-1 rounded-lg">{s.wpm} WPM</span>}
                        <span className={`text-xs px-2 py-1 rounded-lg ${s.is_submitted ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {s.is_submitted ? 'Submitted' : 'In Progress'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 font-mono text-sm text-white/80">
                      {s.answer_text || <span className="text-white/30 italic">Empty</span>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ANALYTICS TAB */}
          {tab === 'analytics' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h1 className="font-display text-3xl font-bold text-white mb-6">Analytics</h1>
              <div className="grid grid-cols-2 gap-4">
                {analytics.map(s => (
                  <div key={s.id} className="glass rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
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
                        { label: 'Avg WPM', value: s.avg_wpm || 0 },
                        { label: 'Accuracy', value: `${s.avg_accuracy || 0}%` },
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
                {analytics.length === 0 && (
                  <div className="col-span-2 glass rounded-2xl p-12 text-center">
                    <BarChart3 className="text-white/20 mx-auto mb-3" size={40} />
                    <p className="text-white/40">No analytics data yet. Students need to complete sessions first.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* NOTIFICATIONS TAB */}
          {tab === 'notifications' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h1 className="font-display text-3xl font-bold text-white mb-6">Notifications</h1>
              <div className="space-y-2">
                {notifications.length === 0 && (
                  <div className="glass rounded-2xl p-12 text-center">
                    <Bell className="text-white/20 mx-auto mb-3" size={40} />
                    <p className="text-white/40">No notifications yet</p>
                  </div>
                )}
                {notifications.map(n => (
                  <div key={n.id} className={`glass rounded-xl p-4 flex items-center gap-3 ${!n.is_read ? 'border-iris-500/20 bg-iris-500/5' : ''}`}>
                    <Bell size={16} className={n.is_read ? 'text-white/30' : 'text-iris-400'} />
                    <div className="flex-1">
                      <div className="text-white/80 text-sm font-medium">{n.title}</div>
                      <div className="text-white/40 text-xs">{n.message} • {new Date(n.created_at).toLocaleString()}</div>
                    </div>
                    {!n.is_read && (
                      <button onClick={async () => { await authFetch(`/users/notifications/${n.id}/read`, { method: 'PATCH' }); loadAll(); }}
                        className="text-xs text-iris-400 hover:text-iris-300">Mark read</button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* New Assignment Modal */}
      <AnimatePresence>
        {showNewAssignment && (
          <Modal title="New Assignment" onClose={() => setShowNewAssignment(false)}>
            <div className="space-y-4">
              <input value={newAssignment.title} onChange={e => setNewAssignment(a => ({ ...a, title: e.target.value }))}
                placeholder="Assignment title" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-iris-500/50" />
              <textarea value={newAssignment.content} onChange={e => setNewAssignment(a => ({ ...a, content: e.target.value }))}
                placeholder="Question or content for students..." rows={4}
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
              <button onClick={createAssignment} className="w-full py-3 bg-iris-600 hover:bg-iris-500 rounded-xl font-semibold text-white transition-all">
                Create Assignment
              </button>
            </div>
          </Modal>
        )}

        {/* Settings Modal */}
        {showSettings && selectedStudent && (
          <Modal title={`Settings for ${selectedStudent.name}`} onClose={() => setShowSettings(false)}>
            <div className="space-y-4">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Dwell Time: {settingsForm.dwellTimeMs}ms</label>
                <input type="range" min={200} max={2000} step={50} value={settingsForm.dwellTimeMs}
                  onChange={e => setSettingsForm(f => ({ ...f, dwellTimeMs: +e.target.value }))}
                  className="w-full accent-iris-500" />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Font Size: {settingsForm.fontSize}px</label>
                <input type="range" min={16} max={36} value={settingsForm.fontSize}
                  onChange={e => setSettingsForm(f => ({ ...f, fontSize: +e.target.value }))}
                  className="w-full accent-iris-500" />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Keyboard Size</label>
                <div className="flex gap-2">
                  {['small', 'medium', 'large'].map(s => (
                    <button key={s} onClick={() => setSettingsForm(f => ({ ...f, keyboardSize: s }))}
                      className={`flex-1 py-2 rounded-lg text-sm capitalize ${settingsForm.keyboardSize === s ? 'bg-iris-600 text-white' : 'bg-white/5 text-white/50'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-white/50 text-xs uppercase tracking-wider">High Contrast</label>
                <button onClick={() => setSettingsForm(f => ({ ...f, highContrast: !f.highContrast }))}
                  className={`w-10 h-6 rounded-full transition-all ${settingsForm.highContrast ? 'bg-iris-600' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${settingsForm.highContrast ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Highlight Color</label>
                <input type="color" value={settingsForm.highlightColor}
                  onChange={e => setSettingsForm(f => ({ ...f, highlightColor: e.target.value }))}
                  className="w-full h-10 rounded-lg cursor-pointer bg-transparent border border-white/10" />
              </div>
              <div className="flex gap-2">
                <button onClick={sendSettings} className="flex-1 py-3 bg-iris-600 hover:bg-iris-500 rounded-xl font-semibold text-white transition-all">
                  Apply Settings
                </button>
                <button onClick={() => { recalibrate(selectedStudent.userId); setShowSettings(false); }}
                  className="flex-1 py-3 glass rounded-xl font-semibold text-white/70 hover:text-white transition-all border border-white/10">
                  Request Recalibration
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function StudentCard({ student, onSettings, onRecalibrate }) {
  const statusClass = student.status === 'active' ? 'status-dot-active' : student.status === 'idle' ? 'status-dot-idle' : 'status-dot-offline';
  const statusLabel = student.status === 'active' ? 'Active' : student.status === 'idle' ? 'Idle' : 'Offline';
  const sessionMins = Math.round((Date.now() - student.connectedAt) / 60000);

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-5 border border-white/5 hover:border-iris-500/20 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: student.status === 'active' ? '#22c55e' : student.status === 'idle' ? '#f59e0b' : '#ef4444', boxShadow: `0 0 6px ${student.status === 'active' ? '#22c55e' : student.status === 'idle' ? '#f59e0b' : '#ef4444'}` }} />
          <div>
            <div className="font-semibold text-white">{student.name}</div>
            <div className="text-white/30 text-xs">{statusLabel} • {sessionMins}m session</div>
          </div>
        </div>
        <button onClick={onSettings} className="p-2 rounded-xl glass text-white/40 hover:text-iris-400 transition-colors">
          <Sliders size={14} />
        </button>
      </div>

      {student.typingProgress && (
        <div className="bg-white/5 rounded-xl p-3 mb-3 font-mono text-sm text-white/70 truncate">
          {student.typingProgress || <span className="text-white/20 italic">Not typing yet</span>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'WPM', value: student.wpm || 0 },
          { label: 'Gaze %', value: `${student.gazeConfidence || 0}%` },
          { label: 'Session', value: `${sessionMins}m` },
        ].map(({ label, value }) => (
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} className="glass rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-white text-lg">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
