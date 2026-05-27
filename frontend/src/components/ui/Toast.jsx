import { create } from 'zustand';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const useToastStore = create((set) => ({
  toasts: [],
  add: (toast) => set((s) => ({ toasts: [...s.toasts, { id: Date.now(), ...toast }] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export const toast = {
  success: (msg) => useToastStore.getState().add({ type: 'success', message: msg }),
  error: (msg) => useToastStore.getState().add({ type: 'error', message: msg }),
  info: (msg) => useToastStore.getState().add({ type: 'info', message: msg }),
  warning: (msg) => useToastStore.getState().add({ type: 'warning', message: msg }),
};

const icons = { success: CheckCircle, error: XCircle, warning: AlertCircle, info: Info };
const colors = {
  success: 'border-green-500/30 bg-green-500/10 text-green-400',
  error: 'border-red-500/30 bg-red-500/10 text-red-400',
  warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

export function ToastContainer() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.type] || Info;
          setTimeout(() => remove(t.id), 4000);
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className={`glass pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium min-w-72 max-w-sm ${colors[t.type]}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="flex-1 text-white/90">{t.message}</span>
              <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100 transition-opacity">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
