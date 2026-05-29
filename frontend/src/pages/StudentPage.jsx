import { useEffect, useRef, useState, useCallback } from 'react';
import { Settings, Trash2, Volume2, X, VideoOff, LogOut, Activity, Send, CheckCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import { toast } from '../components/ui/Toast';

const SMOOTHING = 0.15;
const IDLE_TIMEOUT = 10000;

const ARC_ROWS = [
  ['Q', 'J', 'X', 'Z', 'V', 'K', 'B', 'P', 'Y', 'G'], 
  ['W', 'F', 'M', 'U', 'C', 'L', 'D', 'R', 'H', 'S'], 
  ['E', 'T', 'A', 'O', 'I', 'N'],                     
];

const playPopSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch(e) {}
};

export default function StudentPage() {
  const { user, token, logout, authFetch } = useAuthStore();
  const navigate = useNavigate();

  // Restored State Options
  const [assignment, setAssignment] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [startTime] = useState(Date.now());
  const [wpm, setWpm] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [backspaces, setBackspaces] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // UI State Options
  const [text, setText] = useState('');
  const [dwellTime, setDwellTime] = useState(1000);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isWinking, setIsWinking] = useState(false);
  const [gazeOn, setGazeOn] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);

  const currentKeyRef = useRef(null);
  const gazeStartRef = useRef(null);
  const lockedRef = useRef(false);
  const smoothXRef = useRef(null);
  const smoothYRef = useRef(null);
  const webgazerStartedRef = useRef(false);
  const dwellTimeRef = useRef(dwellTime);
  const idleTimerRef = useRef(null);
  const previewRef = useRef(null); 

  useEffect(() => { dwellTimeRef.current = dwellTime; }, [dwellTime]);

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

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsIdle(true), IDLE_TIMEOUT);
  }, []);

  const triggerWink = () => {
    setIsWinking(true);
    setTimeout(() => setIsWinking(false), 600);
  };

  const emitTyping = useCallback((t) => {
    getSocket()?.emit('student:typing', { text: t, wpm });
  }, [wpm]);

  const handleKey = useCallback((label) => {
    if (submitted) return;
    resetIdleTimer();
    playPopSound();
    triggerWink();
    
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

  const speakText = () => {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
    triggerWink();
  };

  // Restored Auth Fetch Initialization
  useEffect(() => {
    const init = async () => {
      try {
        const [aRes, sessRes] = await Promise.all([
          authFetch('/assignments/active'),
          authFetch('/users/sessions/start', { method: 'POST' }),
        ]);
        if (aRes.ok) { const a = await aRes.json(); setAssignment(a); }
        if (sessRes.ok) { const s = await sessRes.json(); setSessionId(s.id); }
      } catch (_) {}
    };
    init();
    return () => { stopCamera(); if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [authFetch, stopCamera]); 

  // Restored Socket Connections
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    return () => { socket.off('settings:updated'); };
  }, [token]);

  // Restored WPM Interval
  useEffect(() => {
    const iv = setInterval(() => {
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const mins  = (Date.now() - startTime) / 60000;
      setWpm(mins > 0 ? Math.round(words / mins) : 0);
    }, 2000);
    return () => clearInterval(iv);
  }, [text, startTime]);

  useEffect(() => {
    if (submitted) return;
    resetIdleTimer();
    const timer = setTimeout(() => {
      if (webgazerStartedRef.current) return;
      if (typeof window.webgazer === 'undefined') {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/webgazer@2.1.0/dist/webgazer.min.js';
        s.onload = initGaze;
        document.head.appendChild(s);
      } else { initGaze(); }
    }, 800);
    return () => {
      clearTimeout(timer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer, submitted]); 

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
          
          const keys = document.querySelectorAll('.arc-key');
          let found = null;
          keys.forEach(k => {
            const r = k.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = k;
          });

          if (found) {
            const foundKeyId = found.dataset.key;
            
            if (currentKeyRef.current !== found) {
              if (currentKeyRef.current) {
                const prevRing = currentKeyRef.current.querySelector('.dwell-ring');
                if (prevRing) {
                  prevRing.style.transition = 'none';
                  prevRing.style.strokeDashoffset = '100';
                }
              }

              currentKeyRef.current = found;
              gazeStartRef.current = Date.now();
              
              const ring = found.querySelector('.dwell-ring');
              if (ring) {
                void ring.offsetWidth; 
                ring.style.transition = `stroke-dashoffset ${dwellTimeRef.current}ms linear`;
                ring.style.strokeDashoffset = '0';
              }
              resetIdleTimer();
            } else {
              if (Date.now() - gazeStartRef.current >= dwellTimeRef.current && !lockedRef.current) {
                lockedRef.current = true;
                handleKey(foundKeyId);
                
                found.classList.add('key-dwelled');
                
                const ring = found.querySelector('.dwell-ring');
                if (ring) {
                  ring.style.transition = 'none';
                  ring.style.strokeDashoffset = '100';
                }
                
                setTimeout(() => { 
                  lockedRef.current = false; 
                  found.classList.remove('key-dwelled'); 
                }, 400);
                
                gazeStartRef.current = null;
                currentKeyRef.current = null;
              }
            }
          } else {
             if (currentKeyRef.current) {
                const prevRing = currentKeyRef.current.querySelector('.dwell-ring');
                if (prevRing) {
                  prevRing.style.transition = 'none';
                  prevRing.style.strokeDashoffset = '100';
                }
             }
             currentKeyRef.current = null;
             gazeStartRef.current = null;
          }

          if (previewRef.current && !previewRef.current.srcObject) {
            const src = Array.from(document.querySelectorAll('video')).find(v => v.srcObject && v !== previewRef.current);
            if (src) { 
              previewRef.current.srcObject = src.srcObject; 
              previewRef.current.play().catch(() => {}); 
            }
          }

        }).begin();

      window.webgazer.showVideo(false);
      window.webgazer.showFaceOverlay(false);
      window.webgazer.showFaceFeedbackBox(false);
      window.webgazer.showPredictionPoints(false);
      
      webgazerStartedRef.current = true;
      setGazeOn(true);
      setCameraVisible(true);
    } catch (_) {}
  };

  // Restored Submit Logic
  const submitAnswer = async () => {
    if (!text.trim()) return toast.error('Please type an answer first');
    setSubmitting(true);
    try {
      const accuracy = charCount > 0 ? Math.round(((charCount - backspaces) / charCount) * 100) : 100;
      const res = await authFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: assignment?.id || null, answerText: text, isSubmitted: true, wpm, accuracy }),
      });
      if (!res.ok) throw new Error('Submission failed');
      
      getSocket()?.emit('student:submitted', { text });
      setSubmitted(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    } catch (err) {
      toast.error('Submission failed');
    } finally { setSubmitting(false); }
  };

  // Restored Logout Logic
  const handleLogout = async () => {
    stopCamera();
    disconnectSocket();
    logout();
    navigate('/');
  };

  return (
    <div className={`h-screen w-screen flex flex-col p-6 overflow-hidden ${isIdle ? 'idle-mode' : ''}`}>
      
      {/* ─── NEW: Subtle Top Utility Bar ─── */}
      <div className="flex justify-between items-center mb-2 px-2 text-white/50 text-sm font-bold shrink-0 z-10">
        <div className="flex gap-6 items-center">
          <span>👤 {user?.full_name || 'Student View'}</span>
          {assignment && <span>📚 Task: {assignment.title}</span>}
        </div>
        <div className="flex gap-6 items-center">
          <span className="flex items-center gap-2 text-[#f5c842]"><Activity size={16} /> {wpm} WPM</span>
          <button onClick={handleLogout} className="flex items-center gap-2 hover:text-[#f28c6e] transition-colors">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* ─── Top Bar ─── */}
      <header className="flex items-center gap-6 h-28 shrink-0 mb-8 z-10">
        <div className="flex items-center gap-3 w-56 shrink-0 cursor-default">
          <svg viewBox="0 0 100 60" width="70" height="42" className={`nazar-eye ${isWinking ? 'nazar-winking' : ''}`}>
            <path d="M 0 30 Q 50 0 100 30 Q 50 60 0 30" fill="white" className="nazar-sclera" />
            <circle cx="50" cy="30" r="16" fill="#38bdf8" />
            <circle cx="50" cy="30" r="10" fill="#1e3a8a" />
            <circle cx="50" cy="30" r="6" fill="#1a1040" className="nazar-pupil" />
            <circle cx="45" cy="25" r="3" fill="white" opacity="0.8" />
          </svg>
          <span className="text-4xl font-black tracking-wide text-white">Able</span>
        </div>

        <div className="flex-1 h-full bg-[#2a1f5c] rounded-[2rem] p-6 flex items-center shadow-inner relative overflow-hidden">
          {submitted ? (
             <div className="flex items-center text-[#f5c842] font-bold text-4xl">
                <CheckCircle className="mr-4" size={40} /> Answer Submitted
             </div>
          ) : (
             <p className="text-5xl font-bold whitespace-nowrap text-white">
                {text || <span className="text-white/30 italic">Look at letters...</span>}
                <span className="animate-pulse text-[#f5c842] ml-2">|</span>
             </p>
          )}
          {isWinking && <div className="absolute right-6 text-2xl animate-bounce">✨</div>}
        </div>

        <div className="flex gap-4 h-full shrink-0">
          {/* Restored Submit Button */}
          {!submitted && assignment && (
             <button onClick={submitAnswer} disabled={submitting} className="bg-[#f5c842] text-[#1a1040] hover:bg-white font-black text-2xl px-6 rounded-[2rem] flex items-center gap-3 transition-colors shadow-lg">
               <Send size={28} /> {submitting ? '...' : 'Submit'}
             </button>
          )}
          <button onClick={speakText} className="bg-[#f28c6e] hover:bg-[#ff9e80] text-[#1a1040] font-black text-2xl px-6 rounded-[2rem] flex items-center gap-3 transition-colors shadow-lg">
            <Volume2 size={28} /> Speak
          </button>
          <button onClick={() => setText('')} className="bg-[#2a1f5c] border-4 border-[#f28c6e] text-[#f28c6e] hover:bg-[#f28c6e] hover:text-[#1a1040] font-black text-2xl px-6 rounded-[2rem] flex items-center gap-3 transition-colors shadow-lg">
            <Trash2 size={28} /> Clear
          </button>
          <button onClick={() => setSettingsOpen(true)} className="bg-[#2a1f5c] text-white hover:bg-white/20 px-6 rounded-[2rem] flex items-center transition-colors">
            <Settings size={28} />
          </button>
        </div>
      </header>

      {/* ─── Keyboard (Adjusted Curve & Size) ─── */}
      {!submitted && (
        <div className="flex-1 flex flex-col justify-end gap-5 pb-2 keyboard-container relative z-0">
          {ARC_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-3 w-full">
              {row.map((key, i) => {
                const mid = (row.length - 1) / 2;
                const dist = Math.abs(i - mid);
                const curveOffsetY = Math.pow(dist, 2) * 2.5; 
                
                return (
                  <button 
                    key={key} 
                    data-key={key}
                    style={{ transform: `translateY(-${curveOffsetY}px)` }}
                    className="arc-key w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center font-black text-3xl overflow-hidden"
                  >
                    <span className="z-10">{key}</span>
                    <svg preserveAspectRatio="none" viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
                      <rect x="0" y="0" width="100" height="100" rx="50" fill="none" stroke="#f5c842" strokeWidth="8" pathLength="100" strokeDasharray="100" strokeDashoffset="100" className="dwell-ring" />
                    </svg>
                  </button>
                );
              })}
            </div>
          ))}
          
          <div className="flex justify-center gap-4 mt-6">
             <button data-key="SPACE" className="arc-key h-20 px-24 text-2xl font-black">
               SPACE
               <svg preserveAspectRatio="none" viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
                  <rect x="0" y="0" width="100" height="100" rx="50" fill="none" stroke="#f5c842" strokeWidth="8" pathLength="100" strokeDasharray="100" strokeDashoffset="100" className="dwell-ring" />
               </svg>
             </button>
             <button data-key="BACK" className="arc-key h-20 px-12 text-2xl font-black bg-[#402e82]">
               ⌫ BACK
               <svg preserveAspectRatio="none" viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
                  <rect x="0" y="0" width="100" height="100" rx="50" fill="none" stroke="#f5c842" strokeWidth="8" pathLength="100" strokeDasharray="100" strokeDashoffset="100" className="dwell-ring" />
               </svg>
             </button>
          </div>
        </div>
      )}

      {/* ─── Floating Camera Feed ─── */}
      <div className="fixed bottom-6 right-6 w-40 h-28 rounded-3xl overflow-hidden border-4 border-[#2a1f5c] shadow-2xl z-40 bg-[#1a1040] flex items-center justify-center">
         {gazeOn && cameraVisible ? (
            <video 
              ref={previewRef} 
              muted 
              playsInline
              className="w-full h-full object-cover opacity-80"
              style={{ transform: 'scaleX(-1)' }} 
            />
         ) : (
            <div className="flex flex-col items-center text-white/30">
              <VideoOff size={24} className="mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-wider">No Camera</span>
            </div>
         )}
      </div>

      {/* ─── Settings Side Panel ─── */}
      <div className={`fixed top-0 right-0 h-full w-96 bg-[#1a1040] border-l-4 border-[#f5c842] p-8 transition-transform duration-300 z-50 ${settingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <div className="flex justify-between items-center mb-10">
           <h2 className="text-3xl font-black text-[#f5c842]">Settings</h2>
           <button onClick={() => setSettingsOpen(false)} className="text-white hover:text-[#f28c6e]"><X size={40}/></button>
         </div>
         
         <div className="space-y-8">
            <div>
              <label className="block text-xl font-bold mb-4">How long to look before selecting?</label>
              <div className="flex items-center gap-4">
                 <span className="text-lg font-bold w-16">{dwellTime / 1000}s</span>
                 <input 
                   type="range" 
                   min="400" max="2500" step="100" 
                   value={dwellTime} 
                   onChange={(e) => setDwellTime(Number(e.target.value))}
                   className="w-full h-4 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#f5c842]"
                 />
              </div>
            </div>
         </div>
      </div>

    </div>
  );
}