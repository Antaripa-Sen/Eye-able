import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, GraduationCap, BookOpen, ArrowRight, Loader } from 'lucide-react';
import { auth, googleProvider, signInWithPopup } from '../services/firebase';
import useAuthStore from '../store/authStore';
import { toast } from '../components/ui/Toast';

const API = import.meta.env.VITE_API_URL || '/api';

export default function AuthPage() {
  const [tab, setTab] = useState('login');
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', fullName: '', confirmPassword: '' });
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSuccess = (user, token) => {
    setAuth(user, token);
    navigate(user.role === 'teacher' ? '/teacher' : '/student');
  };

  const loginEmail = async () => {
    if (!form.email || !form.password) return toast.error('Email and password required');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password })
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'Login failed');
      handleSuccess(data.user, data.token);
    } catch { toast.error('Connection error. Is the server running?'); }
    finally { setLoading(false); }
  };

  const registerEmail = async () => {
    if (!form.email || !form.password || !form.fullName) return toast.error('All fields required');
    if (form.password.length < 6) return toast.error('Password must be 6+ characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, fullName: form.fullName, role })
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'Registration failed');
      toast.success('Account created!');
      handleSuccess(data.user, data.token);
    } catch { toast.error('Connection error'); }
    finally { setLoading(false); }
  };

  const googleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      const res = await fetch(`${API}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleUid: fbUser.uid,
          email: fbUser.email,
          fullName: fbUser.displayName,
          role
        })
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'Google sign-in failed');
      handleSuccess(data.user, data.token);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') toast.error('Google sign-in failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#1a1040] flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
      
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-[#2a1f5c] rounded-[3rem] p-6 sm:p-8 w-full max-w-md relative shadow-2xl border-4 border-[#1a1040] my-auto shrink-0"
      >
        {/* Logo & Mascot */}
        <div className="text-center mb-6 flex flex-col items-center">
          <svg viewBox="0 0 100 60" width="64" height="38" className="mb-3">
            <path d="M 0 30 Q 50 0 100 30 Q 50 60 0 30" fill="white" />
            <circle cx="50" cy="30" r="16" fill="#38bdf8" />
            <circle cx="50" cy="30" r="10" fill="#1e3a8a" />
            <motion.circle
              cx={50} cy={30} r={6} fill="#1a1040"
              initial={{ cx: 50, cy: 30 }}
              animate={{ cx: [50, 53, 47, 50], cy: [30, 28, 32, 30] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <circle cx="45" cy="25" r="3" fill="white" opacity="0.8" />
          </svg>
          <h1 className="font-black text-3xl text-white tracking-wide">EyeAble</h1>
          <p className="text-[#f5c842] font-bold mt-1 text-sm">Assistive Learning</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#1a1040] rounded-full p-1.5 mb-6">
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-full text-base font-black capitalize transition-all duration-300 
                ${tab === t ? 'bg-[#f5c842] text-[#1a1040]' : 'text-white/50 hover:text-white'}`}>
              {t === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Role selector */}
        <div className="flex gap-3 mb-6">
          {[
            { id: 'student', label: 'Student', Icon: GraduationCap },
            { id: 'teacher', label: 'Teacher', Icon: BookOpen }
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setRole(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.5rem] border-4 font-black transition-all duration-300 
                ${role === id ? 'border-[#f28c6e] bg-[#f28c6e] text-[#1a1040]' : 'border-[#1a1040] bg-[#1a1040] text-white/50 hover:text-white hover:border-white/20'}`}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, x: tab === 'login' ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-3">
            {tab === 'register' && (
              <InputField icon={User} placeholder="Full name" value={form.fullName} onChange={update('fullName')} />
            )}
            <InputField icon={Mail} placeholder="Email address" type="email" value={form.email} onChange={update('email')} />
            <InputField icon={Lock} placeholder="Password" type="password" value={form.password} onChange={update('password')} />
            {tab === 'register' && (
              <InputField icon={Lock} placeholder="Confirm password" type="password" value={form.confirmPassword} onChange={update('confirmPassword')} />
            )}

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={tab === 'login' ? loginEmail : registerEmail}
              disabled={loading}
              className="w-full py-3.5 bg-[#f5c842] hover:bg-white text-[#1a1040] rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-2 transition-all mt-4 shadow-lg">
              {loading ? <Loader size={20} className="animate-spin" /> : <>
                {tab === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={18} />
              </>}
            </motion.button>

            <div className="relative flex items-center gap-4 py-2">
              <div className="flex-1 h-1 bg-[#1a1040] rounded-full" />
              <span className="text-[#f28c6e] font-bold uppercase tracking-widest text-xs">or</span>
              <div className="flex-1 h-1 bg-[#1a1040] rounded-full" />
            </div>

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={googleLogin} disabled={loading}
              className="w-full py-3.5 bg-[#f28c6e] hover:bg-white text-[#1a1040] rounded-[1.5rem] font-black text-base flex items-center justify-center gap-3 transition-all shadow-lg">
              <svg width="20" height="20" viewBox="0 0 18 18" className="bg-white rounded-full p-0.5">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/>
              </svg>
              Continue with Google
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function InputField({ icon: Icon, ...props }) {
  return (
    <div className="relative">
      <Icon className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40" size={18} />
      <input
        {...props}
        className="w-full bg-[#1a1040] border-4 border-[#1a1040] rounded-[1.5rem] pl-14 pr-5 py-3.5 text-base font-bold text-white placeholder-white/30 focus:outline-none focus:border-[#f5c842] transition-all"
      />
    </div>
  );
}