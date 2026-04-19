'use client';

import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, AlertTriangle, Info, X, AlertCircle } from 'lucide-react';
import { toast } from '@/lib/toast';

// ─── Context ───────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

// ─── Single Toast Item ──────────────────────────────────────────────────────
function ToastItem({ id, type, message, duration, onRemove }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    // slide-in
    requestAnimationFrame(() => setVisible(true));

    const step = 50; // ms
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (elapsed >= duration) {
        clearInterval(intervalRef.current);
        handleDismiss();
      }
    }, step);

    return () => clearInterval(intervalRef.current);
  }, []); // eslint-disable-line

  function handleDismiss() {
    setVisible(false);
    setTimeout(() => onRemove(id), 350);
  }

  const configs = {
    success: {
      icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
      bar: 'bg-emerald-500',
      border: 'border-emerald-500/20',
      iconColor: 'text-emerald-400',
      glow: 'shadow-emerald-500/10',
    },
    error: {
      icon: <XCircle className="w-5 h-5 shrink-0" />,
      bar: 'bg-red-500',
      border: 'border-red-500/20',
      iconColor: 'text-red-400',
      glow: 'shadow-red-500/10',
    },
    warning: {
      icon: <AlertTriangle className="w-5 h-5 shrink-0" />,
      bar: 'bg-amber-500',
      border: 'border-amber-500/20',
      iconColor: 'text-amber-400',
      glow: 'shadow-amber-500/10',
    },
    info: {
      icon: <Info className="w-5 h-5 shrink-0" />,
      bar: 'bg-indigo-500',
      border: 'border-indigo-500/20',
      iconColor: 'text-indigo-400',
      glow: 'shadow-indigo-500/10',
    },
  };

  const c = configs[type] || configs.info;

  return (
    <div
      onClick={handleDismiss}
      className={`
        relative flex items-start gap-3 px-4 py-3.5 cursor-pointer
        rounded-2xl border ${c.border}
        bg-slate-900/80 dark:bg-black/80 backdrop-blur-xl
        shadow-2xl ${c.glow}
        w-full max-w-sm overflow-hidden
        transition-all duration-350 ease-out
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}
      `}
      style={{ transition: 'opacity 0.35s ease, transform 0.35s ease' }}
    >
      {/* Icon */}
      <div className={`mt-0.5 ${c.iconColor}`}>{c.icon}</div>

      {/* Message */}
      <p className="flex-1 text-[12px] font-semibold text-white leading-snug pr-4">{message}</p>

      {/* Close */}
      <button
        onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-white/5">
        <div
          className={`h-full ${c.bar} transition-none`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─── Confirm Dialog ─────────────────────────────────────────────────────────
function ConfirmDialog({ message, subMessage, resolve, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const handler = (e) => { if (e.key === 'Escape') handleCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line

  function handleConfirm() {
    setVisible(false);
    setTimeout(() => { resolve(true); onClose(); }, 200);
  }

  function handleCancel() {
    setVisible(false);
    setTimeout(() => { resolve(false); onClose(); }, 200);
  }

  return (
    <div
      className={`fixed inset-0 z-[999] flex items-center justify-center p-4 transition-all duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div
        className={`
          relative z-10 w-full max-w-md
          bg-white/5 dark:bg-black/40 backdrop-blur-2xl
          border border-white/10 rounded-3xl p-8 shadow-2xl
          transition-all duration-200
          ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
        `}
      >
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>

        {/* Text */}
        <h3 className="text-center text-base font-black text-white mb-2 leading-snug">{message}</h3>
        {subMessage && (
          <p className="text-center text-[12px] text-slate-400 mb-6 leading-relaxed">{subMessage}</p>
        )}
        {!subMessage && <div className="mb-6" />}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-black text-[11px] uppercase tracking-widest transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-red-500/20 active:scale-95"
          >
            Konfirmasi
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Provider (Root) ────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const counterRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback((opts) => {
    const id = ++counterRef.current;
    setToasts(prev => {
      const next = [...prev, { id, ...opts }];
      // Keep max 4 toasts
      return next.length > 4 ? next.slice(next.length - 4) : next;
    });
  }, []);

  const addConfirm = useCallback((opts) => {
    setConfirm(opts);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Register with singleton
  useEffect(() => {
    toast._register(addToast, addConfirm);
  }, [addToast, addConfirm]);

  return (
    <ToastContext.Provider value={{ addToast, addConfirm }}>
      {children}

      {/* Toast Stack — bottom-right */}
      {mounted && createPortal(
        <div
          className="fixed bottom-6 right-6 z-[998] flex flex-col-reverse gap-3 pointer-events-none"
          aria-live="polite"
        >
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem {...t} onRemove={removeToast} />
            </div>
          ))}
        </div>,
        document.body
      )}

      {/* Confirm Dialog */}
      {mounted && confirm && createPortal(
        <ConfirmDialog
          {...confirm}
          onClose={() => setConfirm(null)}
        />,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
