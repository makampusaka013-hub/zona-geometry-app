'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LogoMark } from '@/components/LogoMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Building2, Calculator, Shield, Users, Activity, ChevronRight,
  Search, Tag, Star, BarChart2, MapPin, Zap, Lock, Globe
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────
function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(n || 0);
}

// ── Feature Pill ──────────────────────────────────────────────
function FeaturePill({ icon: Icon, label, color }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest ${colors[color]}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ── Role Card ─────────────────────────────────────────────────
function RoleCard({ icon: Icon, title, color, description, features }) {
  const styles = {
    indigo: {
      wrapper: 'border-indigo-200/50 dark:border-indigo-800/40',
      header: 'from-indigo-600 to-indigo-500',
      glow: '0 0 40px 8px rgba(99,102,241,0.15)',
    },
    emerald: {
      wrapper: 'border-emerald-200/50 dark:border-emerald-800/40',
      header: 'from-emerald-600 to-emerald-500',
      glow: '0 0 40px 8px rgba(16,185,129,0.15)',
    },
    amber: {
      wrapper: 'border-amber-200/50 dark:border-amber-800/40',
      header: 'from-amber-600 to-amber-500',
      glow: '0 0 40px 8px rgba(245,158,11,0.15)',
    },
  };
  const s = styles[color];
  return (
    <div
      className={`bg-white dark:bg-[#1e293b] rounded-3xl overflow-hidden border ${s.wrapper} flex flex-col transition-transform duration-300 hover:-translate-y-1`}
      style={{ boxShadow: s.glow }}
    >
      <div className={`bg-gradient-to-br ${s.header} px-6 py-5 flex items-center gap-3`}>
        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="font-black text-white text-lg tracking-tight">{title}</span>
      </div>
      <div className="p-6 flex-1">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{description}</p>
        <ul className="space-y-2">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
              <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-400" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function PublicLandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [ahspData, setAhspData] = useState([]);
  const [hargaData, setHargaData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePreview, setActivePreview] = useState('ahsp');

  useEffect(() => {
    loadPublicData();
  }, []);

  async function loadPublicData() {
    setLoading(true);
    const [{ data: ahsp }, { data: harga }] = await Promise.all([
      supabase.from('master_ahsp').select('id, kode_ahsp, nama_pekerjaan, satuan_pekerjaan').limit(12),
      supabase.from('master_harga_dasar').select('id, kode_item, nama_item, satuan, harga_satuan').limit(12),
    ]);
    setAhspData(ahsp || []);
    setHargaData(harga || []);
    setLoading(false);
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    const pattern = `%${searchQuery.trim().replace(/\s+/g, '%')}%`;
    const [{ data: ahsp }, { data: harga }] = await Promise.all([
      supabase.from('master_ahsp').select('id, kode_ahsp, nama_pekerjaan, satuan_pekerjaan').ilike('nama_pekerjaan', pattern).limit(20),
      supabase.from('master_harga_dasar').select('id, kode_item, nama_item, satuan, harga_satuan').ilike('nama_item', pattern).limit(20),
    ]);
    setAhspData(ahsp || []);
    setHargaData(harga || []);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#020617]">
      {/* JSON-LD Schema for SoftwareApplication & Organization */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Zona Geometry",
            "operatingSystem": "Web",
            "applicationCategory": "BusinessApplication",
            "description": "Aplikasi RAB Pro dan penyusunan AHSP 2026 digital untuk manajemen proyek konstruksi.",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "IDR"
            },
            "publisher": {
              "@type": "Organization",
              "name": "Zona Geometry",
              "url": "https://zonageometry.id",
              "location": {
                "@type": "Place",
                "name": "Kotamobagu, Sulawesi Utara"
              }
            }
          })
        }}
      />

      {/* ── Nav ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <LogoMark className="w-8 h-8" />
            <span className="font-black text-slate-900 dark:text-slate-100 text-lg tracking-tight">Zona Geometry</span>
            <span className="hidden sm:inline text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Pro</span>
          </div>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className="px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-orange-400 transition-colors">
              Masuk
            </Link>
            <Link href="/register" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors">
              Daftar Gratis
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-20 px-4 sm:px-6">
        {/* Background Glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -right-24 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest mb-6">
            <Zap className="w-3.5 h-3.5" />
            Sistem RAB & Monitoring Konstruksi Digital berbasis BIM
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-slate-50 tracking-tight leading-tight mb-6">
            Kelola Proyek Konstruksi
            <br />
            <span className="bg-gradient-to-r from-indigo-600 to-indigo-400 dark:from-orange-500 dark:to-amber-400 bg-clip-text text-transparent">
              Lebih Cerdas & Akurat
            </span>
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-8">
            Sistem bagi peran dengan <strong className="text-slate-700 dark:text-slate-300">3 Slot Kolaborasi</strong> (2 Editor + 1 Verifikator) antar pihak terkait. Satu proyek, satu kebenaran data dengan kontrol fleksibel.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <FeaturePill icon={Calculator} label="RAB & AHSP" color="indigo" />
            <FeaturePill icon={BarChart2} label="Monitoring Real-Time" color="emerald" />
            <FeaturePill icon={Shield} label="Persetujuan Instansi" color="amber" />
            <FeaturePill icon={Users} label="Kolaborasi 3-Pihak" color="indigo" />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 dark:shadow-orange-500/20 hover:shadow-xl hover:-translate-y-0.5">
              Mulai Gratis Sekarang →
            </Link>
            <Link href="/login" className="px-8 py-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 transition-all hover:-translate-y-0.5">
              Sudah Punya Akun
            </Link>
          </div>
        </div>
      </section>

      {/* ── 3-Party Role Cards ───────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {/* Context Narrative for SEO */}
        <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 mb-16 border border-slate-100 dark:border-slate-800 shadow-sm text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-4">Tentang Zona Geometry</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong>Zona Geometry</strong> adalah aplikasi berbasis web revolusioner yang dirancang khusus untuk mempercepat transformasi digital di sektor konstruksi. 
              Aplikasi ini berfungsi sebagai platform manajemen proyek terintegrasi yang memudahkan pengguna dalam 
              <span className="text-indigo-600 dark:text-orange-400 font-bold"> perhitungan AHSP (Analisa Harga Satuan Pekerjaan)</span>, 
              <span className="text-indigo-600 dark:text-orange-400 font-bold"> manajemen CCO (Contract Change Order)</span>, 
              <span className="text-indigo-600 dark:text-orange-400 font-bold"> Mutual Check (MC)</span>, serta penyusunan laporan harian, mingguan, hingga bulanan secara otomatis.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span className="px-3 py-1 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800">Kontraktor</span>
              <span className="px-3 py-1 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800">Konsultan Pengawas</span>
              <span className="px-3 py-1 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800">Dinas PUPR / Instansi</span>
            </div>
          </div>
        </div>

        <div className="text-center mb-10">
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-2">Kolaborasi 3 Slot Peran</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Pemilik proyek dapat mengundang siapa saja ke 3 slot berikut</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <RoleCard
            icon={Building2} color="indigo" title="Editor 1 (Pembuat)"
            description="Slot pertama yang memiliki hak akses penuh untuk merubah dan memasukkan data realisasi fisik atau RAB."
            features={['Input Progress & RAB', 'Edit Data Terpakai', 'Upload Dokumentasi Proyek']}
          />
          <RoleCard
            icon={Activity} color="emerald" title="Editor 2 (Pembuat)"
            description="Slot kedua dengan hak akses edit (tulis), cocok untuk mitra atau pengawas yang ikut mengisi data."
            features={['Manipulasi Data Proyek', 'Bisa Mengisi Bersamaan', 'Terekam sebagai Editor 2']}
          />
          <RoleCard
            icon={Shield} color="amber" title="Verifikator (Pengecek)"
            description="Slot pengawas (Read-Only) yang tidak bisa merubah data, tapi bisa melakukan peninjauan persetujuan final."
            features={['Mode Read-Only (Aman)', 'Approval & Verifikasi Final', 'Melihat Akses Data Tersimpan']}
          />
        </div>
      </section>

      {/* ── Public Catalog Preview ───────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        <div className="bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-black text-slate-900 dark:text-slate-100 text-lg">Katalog Publik</h2>
              <p className="text-xs text-slate-500 mt-0.5">Jelajahi AHSP dan Harga Satuan secara langsung, tanpa perlu login. Sudah Memakai AHSP Nomor 47/SE/Dk/2026</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setActivePreview('ahsp')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${activePreview === 'ahsp' ? 'bg-indigo-600 text-white dark:bg-orange-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}>
                Analisa AHSP
              </button>
              <button onClick={() => setActivePreview('harga')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${activePreview === 'harga' ? 'bg-indigo-600 text-white dark:bg-orange-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}>
                Harga Satuan
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-6 pt-4 pb-2">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari pekerjaan atau material (mis: beton, pasangan bata...)"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:focus:ring-orange-500/30 focus:border-indigo-500 dark:focus:border-orange-500"
                />
              </div>
              <button type="submit" className="px-5 py-2.5 bg-indigo-600 dark:bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors">
                Cari
              </button>
            </form>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600 dark:border-t-orange-500" />
              </div>
            ) : activePreview === 'ahsp' ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-100 dark:border-slate-700">
                    <th className="px-6 py-3">Kode AHSP</th>
                    <th className="px-6 py-3">Nama Pekerjaan</th>
                    <th className="px-6 py-3 text-right">Satuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {ahspData.length === 0 ? (
                    <tr><td colSpan="3" className="px-6 py-12 text-center text-slate-400 text-sm">Tidak ada data</td></tr>
                  ) : ahspData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs font-black text-indigo-600 dark:text-amber-500">{item.kode_ahsp}</td>
                      <td className="px-6 py-3 text-slate-800 dark:text-slate-200">{item.nama_pekerjaan}</td>
                      <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{item.satuan_pekerjaan || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-100 dark:border-slate-700">
                    <th className="px-6 py-3">Kode</th>
                    <th className="px-6 py-3">Nama Material / Pekerjaan</th>
                    <th className="px-6 py-3">Satuan</th>
                    <th className="px-6 py-3 text-right">Harga Dasar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {hargaData.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-400 text-sm">Tidak ada data</td></tr>
                  ) : hargaData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs font-black text-slate-500">{item.kode_item}</td>
                      <td className="px-6 py-3 text-slate-800 dark:text-slate-200">{item.nama_item}</td>
                      <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{item.satuan}</td>
                      <td className="px-6 py-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">{formatIdr(item.harga_satuan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Menampilkan data dari katalog publik Zona Geometry App. <Link href="/register" className="text-indigo-600 dark:text-orange-400 font-bold hover:underline">Daftar sekarang</Link> untuk akses fitur lengkap.
            </p>
          </div>
        </div>
      </section>

      {/* ── Stats / Info ─────────────────────────────────────── */}
      <section className="bg-indigo-600 dark:bg-slate-900 py-14 px-4 sm:px-6 mb-1">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '30 Hari', label: 'Masa Aktif Transparan' },
            { value: '3 Slot', label: 'Kolaborasi Editor & Verifikator' },
            { value: 'Advance', label: 'BIM IFC 3D Ekstraksi Auto' },
            { value: 'Real-Time', label: 'Monitoring Fleksibel' },
          ].map((stat, i) => (
            <div key={i}>
              <div className="text-3xl font-black text-white mb-1">{stat.value}</div>
              <div className="text-indigo-200 dark:text-slate-400 text-xs font-semibold uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="bg-white dark:bg-[#0f172a] border-t border-slate-100 dark:border-slate-800 py-8 px-4 sm:px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <LogoMark className="w-5 h-5" />
          <span className="font-black text-slate-800 dark:text-slate-200 text-sm">Zona Geometry</span>
        </div>
        <p className="text-xs text-slate-400">Sistem RAB & Monitoring Konstruksi — <span className="text-slate-500">Versi Pro</span></p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <Link href="/login" className="text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-orange-400 transition-colors">Masuk</Link>
          <Link href="/register" className="text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-orange-400 transition-colors">Daftar</Link>
        </div>
      </footer>
    </div>
  );
}
