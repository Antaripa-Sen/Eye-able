import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import AuthPage from './pages/AuthPage';
import StudentPage from './pages/StudentPage';
import TeacherPage from './pages/TeacherPage';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastContainer } from './components/ui/Toast';
import useAuthStore from './store/authStore';

export default function App() {
  const { fetchMe, user } = useAuthStore();

  useEffect(() => { fetchMe(); }, []);

  return (
    <BrowserRouter>
      <ToastContainer />
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={user ? <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} /> : <AuthPage />} />
          <Route path="/student" element={<ProtectedRoute role="student"><StudentPage /></ProtectedRoute>} />
          <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  );
}
