'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error('GlobalErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard/rekap-proyek';
  };

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 border border-slate-200 dark:border-slate-800 shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 bg-rose-50 dark:bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-pulse">
              <AlertTriangle className="w-10 h-10 text-rose-600 dark:text-rose-400" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Terjadi Kesalahan Modul
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Aplikasi mengalami kendala teknis saat memuat komponen ini. Jangan khawatir, data Anda tetap aman di server.
              </p>
            </div>

            {this.state.error && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-[10px] font-mono text-rose-500 dark:text-rose-400 break-words text-left overflow-hidden">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-4">
              <button
                onClick={this.handleReload}
                className="w-full py-4 bg-indigo-600 dark:bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Muat Ulang Halaman
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" /> Kembali ke Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
