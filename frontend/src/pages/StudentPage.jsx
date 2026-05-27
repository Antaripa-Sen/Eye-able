import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Send, Trash2, Wifi, WifiOff, Activity, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import { toast } from '../components/ui/Toast';

const DWELL_DEFAULT = 500;
const SMOOTHING = 0.15;

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','BACK'],
  ['SPACE']
];

export default function StudentPage() {
  const { user, token, logout, authFetch } = useAuthStore();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [text, setText] = useState('');
  const [gazeOn, setGazeOn] = useState(false);
  const [gazeConfidence, setGazeConfidence] = useState(0);
  const [activeKey, setActiveKey] = useState(null);
  const [dwellTime, setDwellTime] = useState(DWELL_DEFAULT);
  const [settings, setSettings] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [startTime] = useState(Date.now());
  const [wpm, setWpm] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [backspaces, setBackspaces] = useState(0);
  const [showCalibModal, setShowCalibModal] = useState(false);

  const currentKeyRef = useRef(null);
  const gazeStartRef = useRef(null);
  const lockedRef = useRef(false);
  const smoothXRef = useRef(null);
  const smoothYRef = useRef(null);
  const textRef = useRef('');
  const socketRef = useRef(null);

  textRef.current = text;

  // Load assignment and settings
  useEffect(() => {
    const init = async () => {
      try {
        const [aRes, sRes, sessRes] = await Promise.all([
          authFetch('/assignments/active'),
          authFetch(`/settings/me`),
          authFetch('/users/sessions/start', { method: 'POST' })
        ]);
        if (aRes.ok) { const a = await aRes.json(); setAssignment(a); }
        if (sRes.ok) { const s = await sRes.json(); setSettings(s); setDwellTime(s.dwell_time_ms || 500); }
        if (sessRes.ok) { const sess = await sessRes.json(); setSessionId(sess.id); }
      } catch {}
    };
    init();
  }, []);

  // Socket connection
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    socketRef.current = socket;

    socket.on('settings:updated', (s) => {
      setSettings(s);
      setDwellTime(s.dwell_time_ms || 500);
      toast.info('Settings updated by teacher');
    });

    socket.on('calibration:requested', () => {
      setShowCalibModal(true);
    });

    return () => { socket.off('settings:updated'); socket.off('calibration:requested'); };
  }, [token]);

  // WPM calculation
  useEffect(() => {
    const interval = setInterval(() => {
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const minutes = (Date.now() - startTime) / 60000;
      setWpm(minutes > 0 ? Math.round(words / minutes) : 0);
    }, 2000);
    return () => clearInterval(interval);
  }, [text, startTime]);

  // Emit typing to socket
  const emitTyping = useCallback((t) => {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('student:typing', { text: t, wpm, gazeConfidence });
    }
  }, [wpm, gazeConfidence]);

  const handleKey = useCallback((label) => {
    if (label === 'SPACE') {
      setText(t => { const n = t + ' '; textRef.current = n; emitTyping(n); return n; });
    } else if (label === 'BACK') {
      setBackspaces(b => b + 1);
      setText(t => { const n = t.slice(0, -1); textRef.current = n; emitTyping(n); return n; });
    } else {
      setCharCount(c => c + 1);
      setText(t => { const n = t + label; textRef.current = n; emitTyping(n); return n; });
    }
  }, [emitTyping]);

  // WebGazer initialization
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (typeof window.webgazer === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/webgazer@2.1.0/dist/webgazer.min.js';
        script.onload = initGaze;
        document.head.appendChild(script);
      } else { initGaze(); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [dwellTime]);

  const initGaze = async () => {
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
              if (Date.now() - gazeStartRef.current > dwellTime && !lockedRef.current) {
                lockedRef.current = true;
                handleKey(found.dataset.key);
                setTimeout(() => { lockedRef.current = false; }, dwellTime * 0.8);
                gazeStartRef.current = null;
                currentKeyRef.current = null;
              }
            } else {
              currentKeyRef.current = found;
              gazeStartRef.current = Date.now();
            }
          } else {
            currentKeyRef.current = null;
            gazeStartRef.current = null;
            setActiveKey(null);
          }

          // Emit gaze data
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('student:gaze', { confidence: 0.8, webcamActive: true });
          }
          setGazeConfidence(80);
        })
        .begin();

      window.webgazer.showVideo(true);
      window.webgazer.showFaceOverlay(true);
      window.webgazer.showFaceFeedbackBox(true);
      window.webgazer.showPredictionPoints(false);
      setGazeOn(true);
    } catch (err) {
      console.error('WebGazer error:', err);
      toast.error('Eye tracking unavailable. Use manual clicks.');
    }
  };

  const submitAnswer = async () => {
    if (!text.trim()) return toast.error('Please type an answer first');
    try {
      const duration = Math.round((Date.now() - startTime) / 1000);
      await authFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: assignment?.id || null,
          answerText: text,
          isSubmitted: true,
          wpm,
          accuracy: charCount > 0 ? Math.round(((charCount - backspaces) / charCount) * 100) : 100
        })
      });

      await authFetch('/analytics', {
        method: 'POST',
        body: JSON.stringify({
          sessionId, assignmentId: assignment?.id, wpm,
          accuracy: charCount > 0 ? Math.round(((charCount - backspaces) / charCount) * 100) : 100,
          charactersTyped: charCount, backspacesUsed: backspaces,
          dwellTimeMs: dwellTime, gazeConfidence, sessionDurationSeconds: duration
        })
      });

      getSocket()?.emit('student:submitted', { text });
      toast.success('Answer submitted successfully!');
    } catch { toast.error('Submission failed. Please try again.'); }
  };

  const handleLogout = async () => {
    if (sessionId) {
      await authFetch(`/users/sessions/${sessionId}/end`, { method: 'PATCH' }).catch(() => {});
    }
    if (window.webgazer?.end) try { window.webgazer.end(); } catch {}
    disconnectSocket();
    logout();
    navigate('/');
  };

  const keySize = settings?.keyboard_size === 'small' ? 'text-base py-3 px-2' :
                  settings?.keyboard_size === 'large' ? 'text-2xl py-6 px-4' : 'text-xl py-4 px-3';

  return (
    <div className="min-h-screen mesh-bg" style={settings?.high_contrast ? { filter: 'contrast(1.4)' } : {}}>
      {/* Header */}
      <header className="glass border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Eye className="text-iris-400" size={24} />
          <span className="font-display font-bold text-white">EyeAble</span>
          <span className="glass px-2 py-0.5 rounded-full text-xs text-iris-300 border border-iris-500/20">Student</span>
        </div>

        <div className="flex items-center gap-4">
          {/* WPM indicator */}
          <div className="glass px-3 py-1.5 rounded-xl flex items-center gap-2 text-sm">
            <Activity size={14} className="text-green-400" />
            <span className="text-white/70">{wpm} WPM</span>
          </div>

          {/* Gaze status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm glass ${gazeOn ? 'text-green-400' : 'text-white/40'}`}>
            {gazeOn ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{gazeOn ? 'Eye Tracking ON' : 'No Eye Tracking'}</span>
          </div>

          <div className="text-sm text-white/60">
            {user?.full_name}
          </div>
          <button onClick={handleLogout} className="glass p-2 rounded-xl text-white/60 hover:text-red-400 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Question */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6">
          <p className="text-white/40 text-xs font-medium uppercase tracking-widest mb-2">Current Assignment</p>
          <p className="text-xl font-display font-semibold text-white">
            {assignment?.content || assignment?.title || 'Waiting for assignment from teacher...'}
          </p>
        </motion.div>

        {/* Text output */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }} className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/40 text-xs uppercase tracking-widest">Your Answer</span>
            <span className="text-white/30 text-xs font-mono">{text.length} chars</span>
          </div>
          <div
            className="min-h-16 p-3 bg-white/5 rounded-xl font-mono text-lg text-white border border-white/10"
            style={{ fontSize: settings?.font_size || 20 }}
          >
            {text || <span className="text-white/20">Start typing using your eyes or click the keys below...</span>}
            <span className="animate-pulse text-iris-400">|</span>
          </div>
        </motion.div>

        {/* Keyboard */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }} className="glass rounded-2xl p-6">
          <div className="space-y-3">
            {ROWS.map((row, ri) => (
              <div key={ri} className={`flex justify-center gap-2 ${ri === 3 ? 'mt-2' : ''}`}>
                {row.map((key) => (
                  <motion.button
                    key={key}
                    data-key={key}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleKey(key)}
                    className={`gaze-key rounded-xl border border-white/15 bg-white/8 text-white font-bold font-display cursor-pointer transition-all duration-150 hover:bg-white/15 hover:border-iris-500/40
                      ${key === 'SPACE' ? 'flex-1 max-w-xs py-4' : key === 'BACK' ? 'px-6 py-4 text-sm bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20' : keySize}
                    `}
                    style={key !== 'BACK' && key !== 'SPACE' && activeKey === key ? { backgroundColor: settings?.highlight_color || '#ffd700', color: '#000', borderColor: settings?.highlight_color || '#ffa500' } : {}}
                  >
                    {key === 'SPACE' ? '— SPACE —' : key === 'BACK' ? '⌫ BACK' : key}
                  </motion.button>
                ))}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Actions */}
        <div className="flex gap-3">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={submitAnswer}
            className="flex-1 py-4 bg-iris-600 hover:bg-iris-500 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-iris-600/30">
            <Send size={18} /> Submit Answer
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => { setText(''); toast.info('Cleared'); }}
            className="glass px-6 py-4 rounded-xl font-semibold text-white/60 hover:text-white flex items-center gap-2 transition-all">
            <Trash2 size={18} />
          </motion.button>
        </div>
      </div>

      {/* Calibration Modal */}
      <AnimatePresence>
        {showCalibModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass rounded-2xl p-8 text-center max-w-sm">
              <Eye className="text-iris-400 mx-auto mb-4 animate-pulse" size={48} />
              <h2 className="font-display text-2xl font-bold text-white mb-2">Recalibration Needed</h2>
              <p className="text-white/50 mb-6">Your teacher has requested eye tracking recalibration.</p>
              <button onClick={() => { setShowCalibModal(false); if (window.webgazer) window.webgazer.clearData(); }}
                className="w-full py-3 bg-iris-600 rounded-xl font-semibold text-white">
                Start Calibration
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
