'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReportPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState({
    type: 'bug',
    subject: '',
    description: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/support/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'Laporan Anda telah terkirim! Admin akan segera meninjau.' });
        setFormData({ type: 'bug', subject: '', description: '' });
      } else {
        throw new Error(result.error || 'Gagal mengirim laporan.');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#020617] p-8 lg:p-12">
      <div className="max-w-2xl mx-auto space-y-8">
        
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Laporkan Masalah</h1>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Bantu kami meningkatkan Zona Geometry dengan melaporkan bug atau memberikan saran.</p>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
              : 'bg-red-500/10 text-red-600 border border-red-500/20'
          }`}>
            <span className="text-xl">{message.type === 'success' ? '✅' : '❌'}</span>
            <p className="text-sm font-bold">{message.text}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-100 dark:border-slate-800 shadow-xl space-y-6">
          
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Tipe Laporan</label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {['bug', 'feedback', 'feature_request', 'other'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: t })}
                  className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border ${
                    formData.type === t
                      ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20 scale-105'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-orange-500/50'
                  }`}
                >
                  {t.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Subjek</label>
            <input
              required
              type="text"
              placeholder="Apa yang menjadi kendala Anda?"
              value={formData.subject}
              onChange={e => setFormData({ ...formData, subject: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-slate-900 dark:text-white outline-none focus:border-orange-500 transition-colors font-medium"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Detail Masalah</label>
            <textarea
              required
              rows={5}
              placeholder="Ceritakan sedetail mungkin agar kami bisa segera memperbaikinya..."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-slate-900 dark:text-white outline-none focus:border-orange-500 transition-colors font-medium resize-none"
            />
          </div>

          <button
            disabled={isSubmitting}
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black text-lg transition-all shadow-xl shadow-indigo-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-4 border-white border-t-transparent animate-spin rounded-full"></div>
                Mengirim Laporan...
              </>
            ) : (
              <>
                <span>🚀</span>
                Kirim Laporan Sekarang
              </>
            )}
          </button>
        </form>

        <div className="bg-orange-500/10 border border-orange-500/20 rounded-3xl p-6 text-center">
          <p className="text-orange-500 font-bold text-sm">
            Tim kami biasanya merespons laporan dalam waktu 1x24 jam kerja. Terima kasih telah membantu kami berkembang!
          </p>
        </div>

      </div>
    </div>
  );
}
