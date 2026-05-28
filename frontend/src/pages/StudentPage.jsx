import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, Send, Trash2, Wifi, WifiOff, Activity, LogOut,
  CheckCircle, Clock, Star, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import { toast } from '../components/ui/Toast';

const SMOOTHING     = 0.15;
const TYPING_IDLE   = 5000; // hide camera 5s after last keypress

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','BACK'],
  ['SPACE'],
];

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'Pending',   cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    submitted: { label: 'Submitted', cls: 'bg-blue-500/20   text-blue-400   border-blue-500/30'   },
    reviewed:  { label: 'Reviewed',  cls: 'bg-green-500/20  text-green-400  border-green-500/30'  },
  };
  const cfg = map[status] || { label: status || 'Unknown', cls: 'bg-white/10 text-white/50 border-white/10' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {cfg.label}
    </span>
  );
}

export default function StudentPage() {
  const { user, token, logout, authFetch } = useAuthStore();
  const navigate = useNavigate();

  const [assignment,      setAssignment]      = useState(null);
  const [text,            setText]            = useState('');
  const [gazeOn,          setGazeOn]          = useState(false);
  const [cameraVisible,   setCameraVisible]   = useState(false);
  const [activeKey,       setActiveKey]       = useState(null);
  const [dwellTime,       setDwellTime]       = useState(500);
  const [settings,        setSettings]        = useState(null);
  const [sessionId,       setSessionId]       = useState(null);
  const [startTime]                           = useState(Date.now());
  const [wpm,             setWpm]             = useState(0);
  const [charCount,       setCharCount]       = useState(0);
  const [backspaces,      setBackspaces]      = useState(0);
  const [showCalibModal,  setShowCalibModal]  = useState(false);
  const [submitted,       setSubmitted]       = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [pastSubmissions, setPastSubmissions] = useState([]);
  const [activeTab,       setActiveTab]       = useState('type');
  const [expandedSub,     setExpandedSub]     = useState(null);

  const currentKeyRef      = useRef(null);
  const gazeStartRef       = useRef(null);
  const lockedRef          = useRef(false);
  const smoothXRef         = useRef(null);
  const smoothYRef         = useRef(null);
  const webgazerStartedRef = useRef(false);
  const dwellTimeRef       = useRef(dwellTime);
  const idleTimerRef       = useRef(null);
  const previewRef         = useRef(null);

  useEffect(() => { dwellTimeRef.current = dwellTime; }, [dwellTime]);

  // ── Stop camera completely ────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    try {
      if (window.webgazer) {
        if (typeof window.webgazer.pause === 'function') window.webgazer.pause();
        if (typeof window.webgazer.end   === 'function') window.webgazer.end();
      }
    } catch (_) {}
    document.querySelectorAll('video').forEach(v => {
      try { if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; } } catch (_) {}
    });
    webgazerStartedRef.current = false;
    setGazeOn(false);
    setCameraVisible(false);
  }, []);

  // ── Load submissions ──────────────────────────────────────────────────────
  const loadSubmissions = useCallback(async () => {
    try {
      const res = await authFetch('/submissions');
      if (res.ok) setPastSubmissions(await res.json());
    } catch (_) {}
  }, [authFetch]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const [aRes, sRes, sessRes] = await Promise.all([
          authFetch('/assignments/active'),
          authFetch('/settings/me'),
          authFetch('/users/sessions/start', { method: 'POST' }),
        ]);
        if (aRes.ok)    { const a = await aRes.json(); setAssignment(a); }
        if (sRes.ok)    { const s = await sRes.json(); setSettings(s); setDwellTime(s.dwell_time_ms || 500); }
        if (sessRes.ok) { const s = await sessRes.json(); setSessionId(s.id); }
      } catch (_) {}
      loadSubmissions();
    };
    init();
    return () => { stopCamera(); if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, []); // eslint-disable-line

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    socket.on('settings:updated', (s) => { setSettings(s); setDwellTime(s.dwell_time_ms || 500); toast.info('Settings updated by teacher'); });
    socket.on('calibration:requested', () => setShowCalibModal(true));
    socket.on('submission:reviewed', ({ submissionId, marks, totalMarks, feedback, correction, status }) => {
      setPastSubmissions(prev =>
        prev.map(s => s.id === submissionId
          ? { ...s, marks, total_marks: totalMarks, feedback, correction, graded_at: new Date().toISOString(), status }
          : s
        )
      );
      toast.success(`🎉 Marked! You scored ${marks}/${totalMarks}`);
    });
    return () => { socket.off('settings:updated'); socket.off('calibration:requested'); socket.off('submission:reviewed'); };
  }, [token]);

  // ── WPM ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const mins  = (Date.now() - startTime) / 60000;
      setWpm(mins > 0 ? Math.round(words / mins) : 0);
    }, 2000);
    return () => clearInterval(iv);
  }, [text, startTime]);

  // ── Key handler ───────────────────────────────────────────────────────────
  const emitTyping = useCallback((t) => {
    getSocket()?.emit('student:typing', { text: t, wpm });
  }, [wpm]);

  const resetIdleTimer = useCallback(() => {
    setCameraVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setCameraVisible(false), TYPING_IDLE);
  }, []);

  const handleKey = useCallback((label) => {
    if (submitted) return;
    resetIdleTimer();
    if (label === 'SPACE') {
      setText(t => { const n = t + ' '; emitTyping(n); return n; });
    } else if (label === 'BACK') {
      setBackspaces(b => b + 1);
      setText(t => { const n = t.slice(0, -1); emitTyping(n); return n; });
    } else {
      setCharCount(c => c + 1);
      setText(t => { const n = t + label; emitTyping(n); return n; });
    }
  }, [emitTyping, submitted, resetIdleTimer]);

  // ── WebGazer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'type' || submitted) { stopCamera(); return; }
    const timer = setTimeout(() => {
      if (webgazerStartedRef.current) return;
      if (typeof window.webgazer === 'undefined') {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/webgazer@2.1.0/dist/webgazer.min.js';
        s.onload = initGaze;
        document.head.appendChild(s);
      } else { initGaze(); }
    }, 800);
    return () => clearTimeout(timer);
  }, [activeTab, submitted]); // eslint-disable-line

  const initGaze = async () => {
    if (webgazerStartedRef.current) return;
    try {
      await window.webgazer
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        .setGazeListener((data) => {
          if (!data) return;
          if (smoothXRef.current === null) smoothXRef.current = data.x;
          if (smoothYRef.current === null) smoothYRef.current = data.y;
          smoothXRef.current += SMOOTHING * (data.x - smoothXRef.current);
          smoothYRef.current += SMOOTHING * (data.y - smoothYRef.current);
          const x = smoothXRef.current, y = smoothYRef.current;
          const keys = document.querySelectorAll('.gaze-key');
          let found = null;
          keys.forEach(k => {
            const r = k.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = k;
            k.classList.remove('key-gaze-active');
          });
          if (found) {
            found.classList.add('key-gaze-active');
            setActiveKey(found.dataset.key);
            if (currentKeyRef.current === found) {
              if (!gazeStartRef.current) gazeStartRef.current = Date.now();
              if (Date.now() - gazeStartRef.current > dwellTimeRef.current && !lockedRef.current) {
                lockedRef.current = true;
                handleKey(found.dataset.key);
                setTimeout(() => { lockedRef.current = false; }, dwellTimeRef.current * 0.8);
                gazeStartRef.current = null; currentKeyRef.current = null;
              }
            } else { currentKeyRef.current = found; gazeStartRef.current = Date.now(); }
          } else { currentKeyRef.current = null; gazeStartRef.current = null; setActiveKey(null); }
          getSocket()?.emit('student:gaze', { confidence: 80, webcamActive: true });

          // Mirror stream to inline preview
          if (previewRef.current && !previewRef.current.srcObject) {
            const src = Array.from(document.querySelectorAll('video')).find(v => v.srcObject && v !== previewRef.current);
            if (src) { previewRef.current.srcObject = src.srcObject; previewRef.current.play().catch(() => {}); }
          }
        })
        .begin();

      // Hide WebGazer's own floating UI — we show our own preview
      window.webgazer.showVideo(false);
      window.webgazer.showFaceOverlay(false);
      window.webgazer.showFaceFeedbackBox(false);
      window.webgazer.showPredictionPoints(false);

      webgazerStartedRef.current = true;
      setGazeOn(true);
    } catch (_) {
      toast.error('Eye tracking unavailable — click keys to type.');
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitAnswer = async () => {
    if (!text.trim()) return toast.error('Please type an answer first');
    setSubmitting(true);
    try {
      const duration = Math.round((Date.now() - startTime) / 1000);
      const accuracy = charCount > 0 ? Math.round(((charCount - backspaces) / charCount) * 100) : 100;
      const res = await authFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: assignment?.id || null, answerText: text, isSubmitted: true, wpm, accuracy }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Submission failed'); }
      await authFetch('/analytics', {
        method: 'POST',
        body: JSON.stringify({ sessionId, assignmentId: assignment?.id, wpm, accuracy, charactersTyped: charCount, backspacesUsed: backspaces, dwellTimeMs: dwellTime, sessionDurationSeconds: duration }),
      }).catch(() => {});
      getSocket()?.emit('student:submitted', { text });
      setSubmitted(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setCameraVisible(false);
      toast.success('Answer submitted! Waiting for teacher to review.');
      await loadSubmissions();
    } catch (err) {
      toast.error(err.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    stopCamera();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sessionId) await authFetch(`/users/sessions/${sessionId}/end`, { method: 'PATCH' }).catch(() => {});
    disconnectSocket();
    logout();
    navigate('/');
  };

  const switchTab = (t) => {
    if (t !== 'type') { stopCamera(); if (idleTimerRef.current) clearTimeout(idleTimerRef.current); }
    setActiveTab(t);
  };

  const keySize = settings?.keyboard_size === 'small' ? 'text-base py-3 px-2'
                : settings?.keyboard_size === 'large' ? 'text-2xl py-6 px-4'
                : 'text-xl py-4 px-3';

  return (
    <div className="min-h-screen mesh-bg" style={settings?.high_contrast ? { filter: 'contrast(1.4)' } : {}}>

      {/* Header */}
      <header className="glass border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Eye className="text-iris-400" size={24} />
          <span className="font-display font-bold text-white">EyeAble</span>
          <span className="glass px-2 py-0.5 rounded-full text-xs text-iris-300 border border-iris-500/20">Student</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass px-3 py-1.5 rounded-xl flex items-center gap-2 text-sm">
            <Activity size={14} className="text-green-400" />
            <span className="text-white/70">{wpm} WPM</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm glass ${gazeOn ? 'text-green-400' : 'text-white/40'}`}>
            {gazeOn ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="hidden sm:inline">{gazeOn ? 'Eye Tracking ON' : 'Click to Type'}</span>
          </div>
          <span className="text-sm text-white/60 hidden sm:inline">{user?.full_name}</span>
          <button onClick={handleLogout}
            className="glass px-3 py-2 rounded-xl text-white/60 hover:text-red-400 transition-colors flex items-center gap-2 text-sm">
            <LogOut size={14} /><span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <div className="flex bg-white/5 rounded-2xl p-1 mb-6 w-fit">
          {[
            { id: 'type',    label: '⌨️  Type Answer' },
            { id: 'history', label: `📋  My Submissions${pastSubmissions.length ? ` (${pastSubmissions.length})` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => switchTab(t.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all
                ${activeTab === t.id ? 'bg-iris-600 text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-10 space-y-6">

        {/* ═══ TYPE TAB ═══ */}
        {activeTab === 'type' && (
          <>
            {/* Assignment */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6">
              <p className="text-white/40 text-xs font-medium uppercase tracking-widest mb-2">Current Assignment</p>
              <p className="text-xl font-display font-semibold text-white">
                {assignment?.content || assignment?.title || 'Waiting for an assignment from your teacher…'}
              </p>
              {assignment?.difficulty && (
                <span className="mt-2 inline-block px-2 py-0.5 rounded-full text-xs bg-iris-500/20 text-iris-300 capitalize">
                  {assignment.difficulty}
                </span>
              )}
            </motion.div>

            {/* Submitted banner */}
            <AnimatePresence>
              {submitted && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass rounded-2xl p-4 border border-green-500/30 bg-green-500/8 flex items-center gap-3">
                  <CheckCircle className="text-green-400 shrink-0" size={20} />
                  <div>
                    <p className="text-green-300 font-semibold">Submitted! Your teacher will review it soon.</p>
                    <p className="text-white/40 text-xs mt-0.5">Check "My Submissions" tab for marks and feedback.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Answer + camera preview */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-xs uppercase tracking-widest">Your Answer</span>
                <span className="text-white/30 text-xs font-mono">{text.length} chars</span>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 min-h-16 p-3 bg-white/5 rounded-xl font-mono text-white border border-white/10"
                  style={{ fontSize: settings?.font_size || 20 }}>
                  {text || <span className="text-white/20">Start typing using your eyes or click keys below…</span>}
                  {!submitted && <span className="animate-pulse text-iris-400">|</span>}
                </div>
                {/* Inline camera — ONLY shows when actively typing */}
                <AnimatePresence>
                  {gazeOn && cameraVisible && !submitted && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 110 }} exit={{ opacity: 0, width: 0 }}
                      className="shrink-0 rounded-xl overflow-hidden border border-green-500/30 bg-black relative"
                      style={{ height: 85 }}>
                      <video ref={previewRef} muted playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                      <div className="absolute bottom-1 inset-x-0 text-center">
                        <span className="text-[9px] text-green-400 font-medium">● Tracking</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Keyboard */}
            {!submitted && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6">
                <div className="space-y-3">
                  {ROWS.map((row, ri) => (
                    <div key={ri} className={`flex justify-center gap-2 ${ri === 3 ? 'mt-2' : ''}`}>
                      {row.map((key) => (
                        <motion.button key={key} data-key={key} whileTap={{ scale: 0.92 }}
                          onClick={() => handleKey(key)}
                          className={`gaze-key rounded-xl border border-white/15 bg-white/8 text-white font-bold font-display
                            cursor-pointer transition-all duration-150 hover:bg-white/15 hover:border-iris-500/40
                            ${key === 'SPACE' ? 'flex-1 max-w-xs py-4'
                              : key === 'BACK' ? 'px-6 py-4 text-sm bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20'
                              : keySize}`}
                          style={key !== 'BACK' && key !== 'SPACE' && activeKey === key
                            ? { backgroundColor: settings?.highlight_color || '#ffd700', color: '#000' } : {}}>
                          {key === 'SPACE' ? '— SPACE —' : key === 'BACK' ? '⌫ BACK' : key}
                        </motion.button>
                      ))}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Actions */}
            {!submitted && (
              <div className="flex gap-3">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={submitAnswer} disabled={submitting}
                  className="flex-1 py-4 bg-iris-600 hover:bg-iris-500 disabled:opacity-60 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-iris-600/30">
                  {submitting
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
                    : <><Send size={18} /> Submit Answer</>}
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setText(''); toast.info('Cleared'); }}
                  className="glass px-6 py-4 rounded-xl font-semibold text-white/60 hover:text-white flex items-center gap-2">
                  <Trash2 size={18} />
                </motion.button>
              </div>
            )}
          </>
        )}

        {/* ═══ SUBMISSIONS TAB ═══ */}
        {activeTab === 'history' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-white">My Submissions</h2>
              <button onClick={loadSubmissions}
                className="glass px-3 py-2 rounded-xl text-white/50 hover:text-white text-xs transition-colors">
                ↻ Refresh
              </button>
            </div>

            {pastSubmissions.length === 0 ? (
              <div className="glass rounded-2xl p-12 text-center">
                <BookOpen className="text-white/20 mx-auto mb-3" size={40} />
                <p className="text-white/40">No submissions yet.</p>
                <p className="text-white/20 text-sm mt-1">Submit an answer to see it here.</p>
              </div>
            ) : (
              pastSubmissions.map(sub => {
                const status = sub.status || (sub.graded_at ? 'reviewed' : sub.is_submitted ? 'submitted' : 'pending');
                const isExpanded = expandedSub === sub.id;
                return (
                  <motion.div key={sub.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`glass rounded-2xl border transition-all
                      ${status === 'reviewed' ? 'border-green-500/20' : status === 'submitted' ? 'border-blue-500/20' : 'border-yellow-500/20'}`}>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          {sub.assignment_title && <p className="text-white font-semibold truncate">{sub.assignment_title}</p>}
                          <p className="text-white/30 text-xs">
                            {sub.submitted_at
                              ? `Submitted ${new Date(sub.submitted_at).toLocaleString()}`
                              : `Last updated ${new Date(sub.updated_at).toLocaleString()}`}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={status} />
                            {sub.wpm > 0 && <span className="text-xs text-iris-300 glass px-2 py-0.5 rounded-full">{sub.wpm} WPM</span>}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          {sub.marks !== null && sub.marks !== undefined ? (
                            <div className="glass rounded-xl px-4 py-3 text-center border border-yellow-500/20 bg-yellow-500/5">
                              <div className="flex items-center gap-1 justify-center">
                                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                <span className="font-display font-bold text-xl text-white">{sub.marks}</span>
                                <span className="text-white/40 text-sm">/ {sub.total_marks ?? sub.assignment_total_marks ?? 10}</span>
                              </div>
                              <p className="text-white/30 text-xs mt-0.5">Marks</p>
                            </div>
                          ) : sub.is_submitted ? (
                            <div className="glass rounded-xl px-4 py-3 text-center border border-white/5">
                              <Clock size={16} className="text-white/20 mx-auto mb-1" />
                              <p className="text-white/30 text-xs">Awaiting marks</p>
                            </div>
                          ) : null}
                          <button onClick={() => setExpandedSub(isExpanded ? null : sub.id)}
                            className="glass px-3 py-1.5 rounded-lg text-white/40 hover:text-white text-xs flex items-center gap-1 transition-colors">
                            {isExpanded ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> Details</>}
                          </button>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
                            <div>
                              <p className="text-white/30 text-xs uppercase tracking-wider mb-1.5">Your Answer</p>
                              <div className="bg-white/5 rounded-xl p-3 font-mono text-sm text-white/80 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                {sub.answer_text || <span className="italic text-white/30">Empty</span>}
                              </div>
                            </div>
                            {sub.feedback && (
                              <div className="border border-iris-500/20 bg-iris-500/5 rounded-xl p-4">
                                <p className="text-iris-300 text-xs font-semibold uppercase tracking-wider mb-1.5">💬 Teacher Feedback</p>
                                <p className="text-white/80 text-sm">{sub.feedback}</p>
                              </div>
                            )}
                            {sub.correction && (
                              <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-xl p-4">
                                <p className="text-yellow-300 text-xs font-semibold uppercase tracking-wider mb-1.5">✏️ Correction</p>
                                <p className="text-white/80 text-sm">{sub.correction}</p>
                              </div>
                            )}
                            {sub.graded_at && (
                              <p className="text-white/20 text-xs">Reviewed on {new Date(sub.graded_at).toLocaleString()}</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}
      </div>

      {/* Calibration Modal */}
      <AnimatePresence>
        {showCalibModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass rounded-2xl p-8 text-center max-w-sm mx-4">
              <Eye className="text-iris-400 mx-auto mb-4 animate-pulse" size={48} />
              <h2 className="font-display text-2xl font-bold text-white mb-2">Recalibration Needed</h2>
              <p className="text-white/50 mb-6">Your teacher has requested eye tracking recalibration.</p>
              <button onClick={() => { setShowCalibModal(false); if (window.webgazer) window.webgazer.clearData(); }}
                className="w-full py-3 bg-iris-600 rounded-xl font-semibold text-white">Start Calibration</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}