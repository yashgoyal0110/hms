import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, type }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);
  const api = useCallback(Object.assign((m, t) => push(m, t), {
    success: (m) => push(m, 'success'),
    error: (m) => push(m?.message || m || 'Something went wrong', 'error'),
    info: (m) => push(m, 'info'),
  }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={16} /> : t.type === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
