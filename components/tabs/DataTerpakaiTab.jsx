import React, { useState, useMemo } from 'react';
import Spinner from '../Spinner';
import Empty from '../Empty';
import { Package, ClipboardList, Info, Filter, Edit3, X, RotateCcw, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function DataTerpakaiTab({ 
  activeTab, 
  tabLoading, 
  tabData, 
  formatIdr, 
  onRefresh,
  subTab,
  setSubTab,
  resFilter,
  setResFilter,
  ahspCatalog = {},
  readOnly = false
}) {
  const ahspRows = tabData?.ahsp || [];
  const hargaRows = tabData?.harga || [];

  const filteredHargaRows = useMemo(() => {
    const rows = tabData?.harga || [];
    if (resFilter === 'all') return rows;
    return rows.filter(r => {
      const j = (r.jenis_komponen || '').toLowerCase();
      if (resFilter === 'tenaga') return j === 'upah' || j === 'tenaga' || j === 'worker';
      if (resFilter === 'bahan') return j === 'bahan' || j === 'material' || j === 'barang';
      if (resFilter === 'alat') return j === 'alat' || j === 'peralatan' || j === 'mesin';
      return j === resFilter;
    });
  }, [tabData?.harga, resFilter]);

  if (activeTab !== 'terpakai') return null;
  if (tabLoading) return <Spinner />;


  return (
    <div className="w-full h-full">

      {subTab === 'ahsp' ? (
        <AhspSubView rows={ahspRows} formatIdr={formatIdr} ahspCatalog={ahspCatalog} hargaRows={hargaRows} />
      ) : (
        <HargaSubView rows={filteredHargaRows} formatIdr={formatIdr} onRefresh={onRefresh} readOnly={readOnly} />
      )}
    </div>
  );
}

function AhspSubView({ rows, formatIdr, ahspCatalog, hargaRows }) {
  const [selectedAhsp, setSelectedAhsp] = useState(null);

  if (rows.length === 0) {
    return <Empty icon={<ClipboardList className="w-10 h-10" />} msg="Tidak ada rincian AHSP di RAB ini." />;
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl bg-white dark:bg-[#1e293b]">
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 relative">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[9px] uppercase font-black tracking-widest shadow-sm">
                <th className="px-6 py-4 text-left border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">URAIAN PEKERJAAN</th>
                <th className="px-6 py-4 text-center border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">SATUAN</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">VOLUME</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">HARGA SATUAN</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">TOTAL JUMLAH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {rows.map((item, i) => (
                <tr 
                  key={item.id || i} 
                  onClick={() => setSelectedAhsp(item)}
                  className="hover:bg-indigo-50/50 dark:hover:bg-orange-900/20 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[10px] text-indigo-600 dark:text-orange-400 font-black font-mono">
                        {item.master_ahsp?.kode_ahsp || `AHSP ${i + 1}`}
                      </div>
                      <span className="text-[8px] bg-indigo-50 dark:bg-slate-800 text-indigo-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-slate-700 font-black group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">LIHAT DETAIL</span>
                    </div>
                    <div className="font-bold text-slate-800 dark:text-slate-100 leading-snug">{item.uraian_custom || item.uraian}</div>
                    <div className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">{item.bab_pekerjaan || 'Tanpa Kategori'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-bold text-center">{item.satuan || '-'}</td>
                  <td className="px-6 py-4 text-right font-mono text-xs font-bold">{Number(item.volume || 0).toLocaleString('id-ID')}</td>
                  <td className="px-6 py-4 text-right font-mono text-xs font-medium text-slate-500 dark:text-slate-300">
                    {formatIdr(item.harga_satuan)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs font-black text-slate-900 dark:text-white">{formatIdr(item.jumlah)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAhsp && (
        <AhspDetailModal 
          item={selectedAhsp} 
          details={ahspCatalog[selectedAhsp.master_ahsp_id] || selectedAhsp.analisa_custom || []}
          hargaRows={hargaRows}
          formatIdr={formatIdr} 
          onClose={() => setSelectedAhsp(null)} 
        />
      )}
    </>
  );
}

function AhspDetailModal({ item, details, hargaRows, formatIdr, onClose }) {
  const getOverridePrice = (kode) => {
    const found = hargaRows.find(r => r.key_item === kode || r.kode_item === kode);
    return found ? found.harga_snapshot : null;
  };

  const grouped = useMemo(() => {
    const list = Array.isArray(details) ? details : [];
    return {
      tenaga: list.filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'tenaga'),
      bahan: list.filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'bahan'),
      alat: list.filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'alat'),
      lainnya: list.filter(d => !['tenaga', 'bahan', 'alat'].includes((d.jenis_komponen || d.jenis || '').toLowerCase()))
    };
  }, [details]);

  const subtotalAnalisa = useMemo(() => {
    return Array.isArray(details) ? details.reduce((s, d) => {
      const p = getOverridePrice(d.kode_item) || d.harga_konversi || d.harga || 0;
      return s + (Number(d.koefisien || 0) * Number(p));
    }, 0) : 0;
  }, [details, hargaRows, getOverridePrice]);

  const profitPercent = item.profit_percent !== null && item.profit_percent !== undefined ? Number(item.profit_percent) : 15;
  const hargaSatuanRAB = Math.round(subtotalAnalisa * (1 + (profitPercent / 100)));

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-100 dark:bg-orange-900/40 rounded-2xl">
              <ClipboardList className="w-6 h-6 text-indigo-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black font-mono text-indigo-500 dark:text-orange-400 bg-indigo-50 dark:bg-orange-900/20 px-2 py-0.5 rounded border border-indigo-100 dark:border-orange-900/10">
                  {item.master_ahsp?.kode_ahsp || 'CUSTOM AHSP'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rincian Analisa Pekerjaan</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{item.uraian_custom || item.uraian}</h3>
              <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-tight opacity-70">{item.bab_pekerjaan}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-all group">
            <X className="w-6 h-6 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          {['tenaga', 'bahan', 'alat'].map(cat => (
            grouped[cat].length > 0 && (
              <div key={cat} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${cat === 'tenaga' ? 'bg-blue-500' : cat === 'bahan' ? 'bg-indigo-500' : 'bg-slate-500'}`} />
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    {cat === 'tenaga' ? 'Tenaga Kerja' : cat === 'bahan' ? 'Bahan / Material' : 'Peralatan'}
                  </h4>
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3">Uraian Komponen</th>
                        <th className="px-5 py-3 text-center">Satuan</th>
                        <th className="px-5 py-3 text-right">Koefisien</th>
                        <th className="px-5 py-3 text-right">Harga Satuan</th>
                        <th className="px-5 py-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {grouped[cat].map((d, idx) => {
                        const price = getOverridePrice(d.kode_item) || d.harga_konversi || d.harga || 0;
                        const sub = Number(d.koefisien || 0) * Number(price);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-5 py-3 font-bold text-slate-700 dark:text-slate-200">{d.uraian}</td>
                            <td className="px-5 py-3 text-center font-bold text-slate-400 uppercase">{d.satuan}</td>
                            <td className="px-5 py-3 text-right font-mono font-bold text-indigo-600 dark:text-orange-400">{Number(d.koefisien || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })}</td>
                            <td className="px-5 py-3 text-right font-mono text-slate-500 dark:text-slate-400">{formatIdr(price)}</td>
                            <td className="px-5 py-3 text-right font-mono font-black text-slate-900 dark:text-white">{formatIdr(sub)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ))}

          {details.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 opacity-30">
               <ClipboardList className="w-16 h-16 mb-4" />
               <p className="text-sm font-bold uppercase tracking-widest">Detail rincian tidak tersedia</p>
            </div>
          )}
        </div>

        {/* Footer Sumary */}
        <div className="px-8 py-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Total Harga Dasar</div>
              <div className="text-lg font-mono font-black text-slate-900 dark:text-white">{formatIdr(subtotalAnalisa)}</div>
           </div>
           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Profit / Overhead ({profitPercent}%)</div>
              <div className="text-lg font-mono font-black text-indigo-600 dark:text-orange-400">+{formatIdr(Math.round(subtotalAnalisa * (profitPercent/100)))}</div>
           </div>
           <div className="bg-indigo-600 dark:bg-orange-600 p-5 rounded-2xl shadow-xl shadow-indigo-500/20 dark:shadow-orange-900/20 text-white">
              <div className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-2">Harga Satuan Pekerjaan (RAB)</div>
              <div className="text-xl font-mono font-black">{formatIdr(hargaSatuanRAB)}</div>
           </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Override Harga ───────────────────────────────────────────────
function OverrideModal({ item, formatIdr, onClose, onSaved }) {
  const isOverrideActive = item.source_table === 'master_harga_custom';
  
  const [harga, setHarga] = useState(String(Math.round(item.harga_snapshot || 0)));
  const [tkdn, setTkdn] = useState(String(Number(item.tkdn_percent || 0).toFixed(2)));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newPrice = parseFloat(harga || 0);
      const newTkdn = parseFloat(tkdn || 0);

      let validId = item.overrides_id || item.item_dasar_id || item.master_id || item.id;
      const itemCode = item.key_item || item.kode_item;
      
      // KUNCI UTAMA: Jika ID kosong, cari manual ke tabel aslinya
      if (!validId && itemCode) {
        if (item.source_table === 'master_harga_custom') {
          const { data } = await supabase.from('master_harga_custom').select('id').eq('kode_item', itemCode).limit(1).single();
          if (data) validId = data.id;
        } else {
          const { data } = await supabase.from('master_harga_dasar').select('id').eq('kode_item', itemCode).limit(1).single();
          if (data) validId = data.id;
        }
      }

      if (!validId) {
        alert('Gagal menemukan ID referensi komponen. Pastikan kode item valid.');
        return;
      }

      if (item.source_table === 'master_harga_dasar' || !item.source_table) {
        // Mapping kategori agar sesuai check constraint DB ('Bahan', 'Upah', 'Alat', 'Lumpsum')
        const rawJ = (item.jenis_komponen || item.kategori_item || '').toLowerCase();
        const code = (itemCode || '').trim().toUpperCase();
        const unit = (item.satuan || '').toUpperCase();
        const name = (item.uraian || '').toLowerCase();
        
        let finalKategori = 'Bahan';
        if (rawJ === 'bahan') finalKategori = 'Bahan';
        else if (rawJ === 'upah' || rawJ === 'tenaga') finalKategori = 'Upah';
        else if (rawJ === 'alat') finalKategori = 'Alat';
        else if (rawJ === 'lumpsum' || rawJ === 'ls') finalKategori = 'Lumpsum';
        else {
          // Heuristic fallback
          if (code.startsWith('A') || code.startsWith('B')) finalKategori = 'Bahan';
          else if (code.startsWith('L') || unit === 'OH' || unit === 'ORG' || /\bpekerja\b/.test(name)) finalKategori = 'Upah';
          else if (code.startsWith('M') || unit === 'JAM' || unit === 'SEWA') finalKategori = 'Alat';
          else finalKategori = 'Bahan';
        }

        const { error } = await supabase.from('master_harga_custom').upsert({
          overrides_harga_dasar_id: validId,
          nama_item: item.uraian || item.nama_item,
          satuan: item.satuan,
          harga_satuan: newPrice,
          tkdn_percent: newTkdn,
          kategori_item: finalKategori,
          kode_item: itemCode,
        }, { onConflict: 'user_id,overrides_harga_dasar_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('master_harga_custom')
          .update({ harga_satuan: newPrice, tkdn_percent: newTkdn })
          .eq('id', validId);
        if (error) throw error;
      }

      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset harga ke nilai PUPR resmi? Override Anda akan dihapus.')) return;
    setResetting(true);
    try {
      let validId = item.overrides_id || item.item_dasar_id || item.master_id || item.id;
      const itemCode = item.key_item || item.kode_item;
      
      // KUNCI UTAMA: Jika ID kosong, cari manual ke tabel aslinya
      if (!validId && itemCode) {
        if (item.source_table === 'master_harga_custom') {
          const { data } = await supabase.from('master_harga_custom').select('id').eq('kode_item', itemCode).limit(1).single();
          if (data) validId = data.id;
        } else {
          const { data } = await supabase.from('master_harga_dasar').select('id').eq('kode_item', itemCode).limit(1).single();
          if (data) validId = data.id;
        }
      }

      if (!validId) {
         alert("Gagal menemukan ID referensi komponen untuk direset.");
         return;
      }

      if (item.source_table === 'master_harga_custom') {
        const { error } = await supabase.from('master_harga_custom')
          .delete()
          .eq('id', validId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('master_harga_custom')
          .delete()
          .eq('overrides_harga_dasar_id', validId);
        if (error) throw error;
      }

      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-orange-900/40 rounded-xl">
              <Wrench className="w-4 h-4 text-indigo-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Set Override Harga</h3>
              <p className="text-[10px] text-slate-400 mt-0.5 max-w-[280px] truncate">{item.uraian}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Info Panel PUPR */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-2 border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-semibold">Harga PUPR:</span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-200 font-mono">{formatIdr(item.harga_snapshot)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-semibold">TKDN PUPR:</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">{Number(item.tkdn_percent || 0).toFixed(2)}%</span>
            </div>
            {isOverrideActive && (
              <div className="flex items-center gap-1.5 pt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 text-[9px] font-black rounded-lg uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                  Override aktif
                </span>
              </div>
            )}
          </div>

          {/* Input Override Harga */}
          <div>
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
              Harga Override (Anda) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={harga}
              onFocus={e => e.target.select()}
              onChange={e => setHarga(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-indigo-400 dark:border-orange-500 rounded-xl px-4 py-3 font-mono text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-orange-500/50 transition-all"
              placeholder="Masukkan harga pasar..."
            />
          </div>

          {/* Input TKDN */}
          <div>
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
              TKDN Override % <span className="text-slate-400 font-normal">(0–100)</span>
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tkdn}
              onFocus={e => e.target.select()}
              onChange={e => setTkdn(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-emerald-400 dark:border-emerald-500 rounded-xl px-4 py-3 font-mono text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-500/50 transition-all"
              placeholder="Masukkan persentase TKDN..."
            />
          </div>

          {/* Catatan */}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            <span className="font-black text-indigo-500 dark:text-orange-400">ℹ</span>{' '}
            Harga ini akan <strong>otomatis diterapkan</strong> ke seluruh AHSP yang menggunakan item ini. User lain tidak terpengaruh.
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center gap-3 px-6 pb-6">
          {isOverrideActive && (
            <button
              onClick={handleReset}
              disabled={resetting}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black transition-all border border-slate-200 dark:border-slate-600"
            >
              {resetting ? <div className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-400 animate-spin rounded-full" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Reset PUPR
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-black transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black transition-all shadow-lg shadow-orange-200 dark:shadow-orange-900/30"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : '✓ Set Override'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tabel Komponen Terpakai ────────────────────────────────────────────
function HargaSubView({ rows, formatIdr, onRefresh, readOnly }) {
  const [overrideItem, setOverrideItem] = useState(null);

  if (rows.length === 0) {
    return <Empty icon={<Package className="w-10 h-10" />} msg="Belum ada data harga satuan terpakai." />;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl bg-white dark:bg-[#1e293b]">
          <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 relative">
            <table className="min-w-full w-full text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-[60]">
                <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[9px] uppercase font-black tracking-widest shadow-sm">
                  <th className="px-6 py-4 text-left border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">KATALOG KOMPONEN</th>
                  <th className="px-6 py-4 text-center border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">JENIS</th>
                  <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">VOL. TERPAKAI</th>
                  <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">HARGA SATUAN</th>
                  <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">SKOR TKDN</th>
                  <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">CONTRIBUTION VALUE</th>
                  <th className="px-6 py-4 text-center border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {rows.map((item, i) => {
                  // Heuristic: Using strict prefix rules (A/B=Bahan, L=Tenaga, M=Alat)
                  const rawJ = (item.jenis_komponen || '').toLowerCase();
                  const code = (item.key_item || '').trim().toUpperCase();
                  const unit = (item.satuan || '').toUpperCase();
                  const name = (item.uraian || '').toLowerCase();
                  
                  let j = rawJ;
                  if (!rawJ || rawJ === 'bahan_upah_alat' || rawJ === 'upah') {
                    if (code.startsWith('A') || code.startsWith('B')) {
                      j = 'bahan';
                    } else if (code.startsWith('L')) {
                      j = 'tenaga';
                    } else if (code.startsWith('M')) {
                      j = 'alat';
                    } else if (unit === 'OH' || unit === 'ORG' || /\bpekerja\b/.test(name) || name.includes('tukang') || name.includes('mandor')) {
                      // fallback for NO-REF items
                      j = 'tenaga';
                    } else if (unit === 'JAM' || unit === 'SEWA' || name.includes('alat berat')) {
                      j = 'alat';
                    } else {
                      j = 'bahan';
                    }
                  }

                  const isOverridden = item.source_table === 'master_harga_custom';
                  const jBadge = {
                    tenaga: 'bg-blue-100 text-blue-700 dark:bg-orange-900/40 dark:text-orange-400',
                    bahan: 'bg-indigo-100 text-indigo-700 dark:bg-amber-900/30 dark:text-amber-400',
                    alat: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                  }[j] || 'bg-slate-100 text-slate-500';

                  return (
                    <tr key={i} className="hover:bg-indigo-50/20 dark:hover:bg-orange-500/10 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <div>
                            <div className="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-tight">{item.uraian}</div>
                            <div className="text-[9px] font-mono text-slate-400 mt-1 uppercase tracking-tighter">{item.key_item || 'NO-REF'} · {item.satuan}</div>
                          </div>
                          {isOverridden && (
                            <span className="shrink-0 mt-0.5 text-[8px] font-black px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 rounded-md uppercase tracking-wider border border-orange-200 dark:border-orange-700">
                              Override
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider border ${jBadge}`}>
                          {j === 'tenaga' ? '👷 Tenaga' : j === 'bahan' ? '🧱 Bahan' : '⚙️ Alat'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs font-black text-slate-700 dark:text-slate-200">
                        {Number(item.total_volume_terpakai || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                      </td>
                      <td className={`px-6 py-4 text-right font-mono text-xs font-bold ${isOverridden ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {formatIdr(item.harga_snapshot)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{Number(item.tkdn_percent || 0).toFixed(2)}%</td>
                      <td className="px-6 py-4 text-right font-mono text-xs font-black text-slate-900 dark:text-white">{formatIdr(item.kontribusi_nilai)}</td>
                      <td className="px-6 py-4 text-center">
                        {!readOnly ? (
                          <button
                            onClick={() => setOverrideItem(item)}
                            className={`p-2 rounded-xl transition-all ${
                              isOverridden
                                ? 'text-orange-500 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10'
                                : 'text-slate-400 hover:text-indigo-600 dark:hover:text-orange-400 hover:bg-indigo-50 dark:hover:bg-orange-500/10'
                            }`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="p-2 text-slate-300 dark:text-slate-700 cursor-not-allowed" title="Update Pro untuk edit">
                            <Edit3 className="w-4 h-4 opacity-50" />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {overrideItem && (
        <OverrideModal
          item={overrideItem}
          formatIdr={formatIdr}
          onClose={() => setOverrideItem(null)}
          onSaved={() => {
            setOverrideItem(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </>
  );
}

