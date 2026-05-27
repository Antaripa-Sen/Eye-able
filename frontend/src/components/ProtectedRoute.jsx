import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-iris-600/20 border border-iris-500/30 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
              <ellipse cx="12" cy="12" rx="10" ry="6" /><circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <p className="text-white/40 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;

  return children;
}
