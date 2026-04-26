'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { supabase } from '@/lib/supabase';

export default function AboutPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState({
    type: 'bug',
    subject: '',
    description: ''
  });

  const features = [
// ... (features array lines 15-52)
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/support/report', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify(formData)
      });

      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || 'Gagal mengirim laporan.');
      }

      if (result.success) {
        setMessage({ type: 'success', text: 'Laporan Anda telah terkirim! Admin akan segera meninjau.' });
        setFormData({ type: 'bug', subject: '', description: '' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-[#020617] p-6 lg:p-12 space-y-16">
      <div className="max-w-5xl mx-auto space-y-20">
        
        {/* Section 1: Hero Info */}
        <section className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="inline-flex items-center justify-center mb-4">
            <Logo className="h-24 lg:h-32" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-6xl font-black text-white leading-tight tracking-tight">
              Akselerasi RAB dengan <br />
              <span className="bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent">Kecerdasan Data Konstruksi</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
              Zona Geometry adalah pendamping digital Anda dalam mengelola estimasi proyek pembangunan. Kami menyederhanakan kompleksitas AHSP menjadi alur kerja yang intuitif dan akurat.
            </p>
          </div>
        </section>

        {/* Section 2: Premium Feature Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 outline-none">
          {features.map((f, i) => (
            <div key={i} className="group p-8 bg-slate-900/40 backdrop-blur-md rounded-[32px] border border-white/5 hover:border-amber-500/30 transition-all duration-300">
              <div className="mb-6 p-4 w-fit bg-amber-500/10 rounded-2xl group-hover:bg-amber-500/20 transition-colors">
                {f.icon}
              </div>
              <h3 className="text-xl font-black text-white mb-3 tracking-wide">{f.title}</h3>
              <p className="text-slate-400 leading-relaxed font-medium text-sm">
                {f.desc}
              </p>
            </div>
          ))}
        </section>

        {/* Section 3: Visionary Quote */}
        <section className="bg-gradient-to-br from-indigo-950 to-slate-950 rounded-[40px] p-12 lg:p-16 border border-white/10 text-center relative overflow-hidden shadow-3xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -mr-48 -mt-48 blur-[100px]"></div>
          <div className="relative z-10 space-y-8">
            <h2 className="text-3xl font-black text-white">Standar Baru Efisiensi</h2>
            <p className="text-slate-300 text-lg lg:text-xl max-w-3xl mx-auto italic font-medium leading-relaxed">
              "Visi kami adalah meminimalkan 'gap' antara estimasi dan realisasi di lapangan melalui integrasi data wilayah yang presisi."
            </p>
            <div className="flex justify-center gap-4">
              <span className="px-5 py-2 rounded-full border border-white/10 bg-white/5 text-xs font-black text-amber-500 uppercase tracking-widest">
                Reliable
              </span>
              <span className="px-5 py-2 rounded-full border border-white/10 bg-white/5 text-xs font-black text-amber-500 uppercase tracking-widest">
                Accurate
              </span>
            </div>
          </div>
        </section>

        {/* Section 4: Integrated ISSUE REPORT Form */}
        <section id="report" className="max-w-3xl mx-auto pt-16 border-t border-white/5 space-y-12">
          <div className="text-center space-y-4">
            <div className="inline-flex bg-red-500/10 text-red-500 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-4">
              Support Center
            </div>
            <h2 className="text-3xl lg:text-4xl font-black text-white">Ada Masalah? Laporkan Sekarang</h2>
            <p className="text-slate-400 font-medium">Bantu kami menyempurnakan Zona Geometry. Admin akan merespons dalam 1x24 jam.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-slate-900/60 backdrop-blur-2xl p-8 lg:p-10 rounded-[40px] border border-white/10 shadow-2xl space-y-8">
            {message && (
              <div className={`p-5 rounded-2xl flex items-center gap-4 animate-in fade-in zoom-in duration-300 ${
                message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                <span className="text-2xl">{message.type === 'success' ? '✨' : '⚠️'}</span>
                <p className="text-sm font-bold">{message.text}</p>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {['bug', 'feedback', 'feature_request', 'other'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: t })}
                  className={`py-4 px-2 rounded-2xl text-[10px] font-black tracking-tighter transition-all border ${
                    formData.type === t
                      ? 'bg-amber-500 text-black border-amber-500 shadow-xl shadow-amber-500/20 scale-105'
                      : 'bg-slate-800/50 text-slate-500 border-white/5 hover:border-amber-500/40'
                  }`}
                >
                  {t.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Subjek Kendala</label>
                <input
                  required
                  type="text"
                  placeholder="Misal: Perhitungan RAB belum muncul..."
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full bg-slate-950/50 border-2 border-white/5 rounded-3xl px-8 py-5 text-white placeholder:text-slate-700 outline-none focus:border-amber-500/50 transition-all font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Detail Laporan</label>
                <textarea
                  required
                  rows={5}
                  placeholder="Jelaskan langkah-langkah masalah Anda agar kami bisa segera meniru dan memperbaikinya..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-950/50 border-2 border-white/5 rounded-[32px] px-8 py-5 text-white placeholder:text-slate-700 outline-none focus:border-amber-500/50 transition-all font-bold resize-none"
                />
              </div>
            </div>

            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black py-6 rounded-[32px] font-black text-xl transition-all shadow-2xl shadow-amber-600/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-4 group"
            >
              {isSubmitting ? (
                <>
                  <div className="w-6 h-6 border-4 border-black border-t-transparent animate-spin rounded-full"></div>
                  <span>MENGIRIM LAPORAN...</span>
                </>
              ) : (
                <>
                  <span className="group-hover:translate-x-1 transition-transform">🚀</span>
                  <span>KIRIM LAPORAN SEKARANG</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Section 5: Upgrade / Premium CTA */}
        <section className="bg-slate-900/40 backdrop-blur-md rounded-[32px] border border-amber-500/20 p-8 lg:p-12 text-center space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-black text-white">Ingin Kapasitas Lebih Besar?</h2>
            <p className="text-slate-400 font-medium">Buka akses proyek tak terbatas dan fitur Kolaborasi Premium (Advance).</p>
          </div>
          <a
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-2xl font-black tracking-widest uppercase transition-all shadow-lg border border-white/5 hover:border-amber-500/30 active:scale-95"
          >
            Upgrade / Ganti Paket
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </section>

        {/* Footer info */}
        <div className="text-center pt-20 pb-10">
          <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] opacity-50">
            Zona Geometry Pro &bull; Build {new Date().getFullYear()} &bull; Stable Build
          </p>
        </div>

      </div>
    </div>
  );
}
