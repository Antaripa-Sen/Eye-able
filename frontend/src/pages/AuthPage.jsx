import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Eye, Mail, Lock, User, GraduationCap, BookOpen, ArrowRight, Loader } from 'lucide-react';
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
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
      {/* Decorative orbs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 rounded-full bg-iris-600/10 blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass rounded-3xl p-8 w-full max-w-md relative overflow-hidden"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-iris-600/20 border border-iris-500/30 mb-4"
          >
            <Eye className="text-iris-400" size={32} />
          </motion.div>
          <h1 className="font-display text-3xl font-bold text-gradient">EyeAble</h1>
          <p className="text-white/40 text-sm mt-1 font-sans">Assistive Learning Platform</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-white/5 rounded-2xl p-1 mb-6">
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all duration-200 ${tab === t ? 'bg-iris-600 text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`}>
              {t === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Role selector */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'student', label: 'Student', Icon: GraduationCap },
            { id: 'teacher', label: 'Teacher', Icon: BookOpen }
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setRole(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${role === id ? 'border-iris-500 bg-iris-500/20 text-iris-300' : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'}`}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, x: tab === 'login' ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            {tab === 'register' && (
              <InputField icon={User} placeholder="Full name" value={form.fullName} onChange={update('fullName')} />
            )}
            <InputField icon={Mail} placeholder="Email address" type="email" value={form.email} onChange={update('email')} />
            <InputField icon={Lock} placeholder="Password" type="password" value={form.password} onChange={update('password')} />
            {tab === 'register' && (
              <InputField icon={Lock} placeholder="Confirm password" type="password" value={form.confirmPassword} onChange={update('confirmPassword')} />
            )}

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              onClick={tab === 'login' ? loginEmail : registerEmail}
              disabled={loading}
              className="w-full py-3.5 bg-iris-600 hover:bg-iris-500 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-iris-600/30 mt-2">
              {loading ? <Loader size={18} className="animate-spin" /> : <>
                {tab === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} />
              </>}
            </motion.button>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-white/30 text-xs">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              onClick={googleLogin} disabled={loading}
              className="w-full py-3.5 bg-white hover:bg-white/95 text-gray-800 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 transition-all duration-200 disabled:opacity-60 shadow-lg">
              <svg width="18" height="18" viewBox="0 0 18 18">
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
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" size={16} />
      <input
        {...props}
        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-iris-500/60 focus:bg-white/8 transition-all duration-200"
      />
    </div>
  );
}
