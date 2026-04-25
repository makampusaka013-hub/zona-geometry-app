'use client';

import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function ModernConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Konfirmasi', 
  message = 'Apakah Anda yakin ingin melanjutkan?',
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  type = 'warning' // 'warning' | 'danger' | 'info'
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        <div className="p-8 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 ${
            type === 'danger' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-500' :
            type === 'warning' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500' :
            'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500'
          }`}>
            <AlertCircle className="w-8 h-8" />
          </div>
          
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-2">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed mb-8">
            {message}
          </p>
          
          <div className="flex w-full gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              {cancelText}
            </button>
            <button 
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-[1.5] py-4 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 ${
                type === 'danger' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' :
                type === 'warning' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20' :
                'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
