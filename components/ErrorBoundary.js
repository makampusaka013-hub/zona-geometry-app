'use client';

import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-900/30 rounded-[2.5rem] text-center space-y-6">
          <div className="w-20 h-20 bg-rose-100 dark:bg-rose-500/20 rounded-3xl flex items-center justify-center">
            <ShieldAlert className="w-10 h-10 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Terjadi Kesalahan</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Modul ini mengalami masalah teknis. Anda dapat mencoba memuat ulang atau hubungi tim dukungan jika masalah berlanjut.
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-8 py-3 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 mx-auto"
          >
            <RotateCcw className="w-4 h-4" /> COBA LAGI
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-4 p-4 bg-slate-900 text-rose-400 text-[10px] rounded-xl overflow-auto text-left max-w-full font-mono">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
