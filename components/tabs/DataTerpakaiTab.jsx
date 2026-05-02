import React, { useState, useMemo, Fragment } from 'react';
import Spinner from '../Spinner';
import { Package, ClipboardList, Info, Filter, Edit3, X, RotateCcw, Wrench, Box } from 'lucide-react';
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

    return rows.filter(item => {
      const rawJ = (item.jenis_komponen || '').toLowerCase();
      const code = (item.key_item || item.kode_item || '').trim().toUpperCase();
      const unit = (item.satuan || '').toUpperCase();
      const name = (item.uraian || '').toLowerCase();

      let j = rawJ;
      // Heuristic fallback if type is missing or ambiguous
      if (!rawJ || rawJ === 'bahan_upah_alat' || rawJ === 'upah') {
        if (code.startsWith('A') || code.startsWith('B')) {
          j = 'bahan';
        } else if (code.startsWith('L') || unit === 'OH' || unit === 'ORG' || /\bpekerja\b/.test(name) || name.includes('tukang') || name.includes('mandor')) {
          j = 'tenaga';
        } else if (code.startsWith('M') || unit === 'JAM' || unit === 'SEWA' || name.includes('alat berat')) {
          j = 'alat';
        } else {
          j = 'bahan';
        }
      }

      if (resFilter === 'tenaga') return j === 'upah' || j === 'tenaga' || j === 'worker';
      if (resFilter === 'bahan') return j === 'bahan' || j === 'material' || j === 'barang';
      if (resFilter === 'alat') return j === 'alat' || j === 'peralatan' || j === 'mesin';
      return j === resFilter;
    });
  }, [tabData?.harga, resFilter]);

  if (activeTab !== 'terpakai') return null;
  if (tabLoading) return <Spinner />;

  if (ahspRows.length === 0 && hargaRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 w-full opacity-40 dark:opacity-20 pointer-events-none select-none">
        <Box className="w-24 h-24 mb-6 text-slate-500 dark:text-slate-400" strokeWidth={1} />
        <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.4em] text-center">
          BELUM ADA KOMPONEN TERPAKAI
        </h3>
      </div>
    );
  }


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
  const [expandedId, setExpandedId] = useState(null);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 w-full opacity-40 dark:opacity-20 pointer-events-none select-none">
        <Box className="w-24 h-24 mb-6 text-slate-500 dark:text-slate-400" strokeWidth={1} />
        <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.4em] text-center">
          BELUM ADA KOMPONEN TERPAKAI
        </h3>
      </div>
    );
  }

  const getOverridePrice = (kode) => {
    const found = hargaRows.find(r => r.key_item === kode || r.kode_item === kode);
    return found ? found.harga_snapshot : null;
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl bg-white dark:bg-[#1e293b]">
      <div className="overflow-x-auto max-h-[700px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 relative">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[9px] uppercase font-black tracking-widest shadow-sm">
              <th className="px-6 py-4 text-left border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">URAIAN PEKERJAAN</th>
              <th className="px-6 py-4 text-center border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">SATUAN</th>
              <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">VOLUME</th>
              <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">HARGA SATUAN</th>
              <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">TOTAL JUMLAH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {rows.map((item, i) => {
              const rowId = item.id || i;
              const isExpanded = expandedId === rowId;
              const details = ahspCatalog[item.master_ahsp_id] || item.analisa_custom || [];
              
              // Sort details like in catalog
              const sortedDetails = [...details].sort((a, b) => {
                const order = { 'upah': 0, 'tenaga': 0, 'bahan': 1, 'alat': 2 };
                const ja = (a.jenis_komponen || a.jenis || '').toLowerCase();
                const jb = (b.jenis_komponen || b.jenis || '').toLowerCase();
                return (order[ja] ?? 99) - (order[jb] ?? 99);
              });

              return (
                <Fragment key={rowId}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : rowId)}
                    className={`hover:bg-indigo-50/50 dark:hover:bg-orange-900/20 transition-colors cursor-pointer group ${isExpanded ? 'bg-indigo-50/30 dark:bg-orange-900/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-[10px] text-indigo-600 dark:text-orange-400 font-black font-mono">
                          {item.master_ahsp?.kode_ahsp || `AHSP ${i + 1}`}
                        </div>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-black transition-all ${isExpanded ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 dark:bg-slate-800 text-indigo-400 dark:text-slate-500 border-indigo-100 dark:border-slate-700'}`}>
                          {isExpanded ? 'TUTUP DETAIL' : 'LIHAT DETAIL'}
                        </span>
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 leading-snug">{item.uraian_custom || item.uraian}</div>
                      <div className="text-[10px] text-slate-400 mt-1 uppercase font-semibold tracking-tighter">{item.bab_pekerjaan || 'Tanpa Kategori'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-bold text-center">{item.satuan || '-'}</td>
                    <td className="px-6 py-4 text-right font-mono text-xs font-bold">{Number(item.volume || 0).toLocaleString('id-ID')}</td>
                    <td className="px-6 py-4 text-right font-mono text-xs font-medium text-slate-500 dark:text-slate-300">
                      {formatIdr(item.harga_satuan)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs font-black text-slate-900 dark:text-white">{formatIdr(item.jumlah)}</td>
                  </tr>

                  {/* INLINE EXPANDED DETAILS */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                        <div className="mx-4 mb-4 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm bg-white dark:bg-slate-800">
                          <table className="w-full text-[10px] text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-400 font-black uppercase tracking-wider">
                                <th className="px-4 py-3 w-[15%]">Kode</th>
                                <th className="px-4 py-3 w-[45%]">Uraian Komponen</th>
                                <th className="px-4 py-3 text-center w-[10%]">Satuan</th>
                                <th className="px-4 py-3 text-right w-[10%]">Koef</th>
                                <th className="px-4 py-3 text-right w-[20%]">Harga</th>
                                <th className="px-4 py-3 text-right w-[20%]">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {sortedDetails.length > 0 ? sortedDetails.map((det, dIdx) => {
                                const j = (det.jenis_komponen || det.jenis || '').toLowerCase();
                                const price = getOverridePrice(det.kode_item || det.kode) || det.harga_konversi || det.harga || 0;
                                const sub = Number(det.koefisien || 0) * Number(price);
                                
                                const badge = {
                                  tenaga: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                  upah: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                  bahan: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                  alat: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                }[j] || 'bg-slate-100 text-slate-500';

                                return (
                                  <tr key={dIdx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-2 font-mono font-bold text-slate-400">{det.kode_item || det.kode || '-'}</td>
                                    <td className="px-4 py-2 font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                      <span className={`text-[7px] px-1 py-0.5 rounded uppercase font-black tracking-widest ${badge}`}>{j === 'upah' || j === 'tenaga' ? 'Pekerja' : j}</span>
                                      {det.uraian || det.nama_item || det.uraian_ahsp}
                                    </td>
                                    <td className="px-4 py-2 text-center font-bold text-slate-400">{det.satuan || det.satuan_uraian}</td>
                                    <td className="px-4 py-2 text-right font-mono font-bold text-indigo-500 dark:text-orange-400">{Number(det.koefisien || 0).toLocaleString('id-ID', { maximumFractionDigits: 5 })}</td>
                                    <td className="px-4 py-2 text-right font-mono text-slate-400">{formatIdr(price)}</td>
                                    <td className="px-4 py-2 text-right font-mono font-black text-slate-900 dark:text-white">{formatIdr(sub)}</td>
                                  </tr>
                                );
                              }) : (
                                <tr>
                                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-bold uppercase tracking-widest">Detail rincian tidak tersedia</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          
                          {/* Mini Summary at bottom of expansion */}
                          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-6 border-t border-slate-100 dark:border-slate-700">
                             <div className="flex flex-col items-end">
                               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Harga Dasar</span>
                               <span className="text-[10px] font-mono font-black text-slate-900 dark:text-white">
                                 {formatIdr(sortedDetails.reduce((s, d) => s + (Number(d.koefisien || 0) * (getOverridePrice(d.kode_item || d.kode) || d.harga_konversi || d.harga || 0)), 0))}
                               </span>
                             </div>
                             <div className="flex flex-col items-end">
                               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Profit ({item.profit_percent ?? 15}%)</span>
                               <span className="text-[10px] font-mono font-black text-indigo-600 dark:text-orange-400">
                                 +{formatIdr(Math.round(sortedDetails.reduce((s, d) => s + (Number(d.koefisien || 0) * (getOverridePrice(d.kode_item || d.kode) || d.harga_konversi || d.harga || 0)), 0) * ((item.profit_percent ?? 15) / 100)))}
                               </span>
                             </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
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
    return (
      <div className="flex flex-col items-center justify-center py-40 w-full opacity-40 dark:opacity-20 pointer-events-none select-none">
        <Box className="w-24 h-24 mb-6 text-slate-500 dark:text-slate-400" strokeWidth={1} />
        <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.4em] text-center">
          BELUM ADA KOMPONEN TERPAKAI
        </h3>
      </div>
    );
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
                            className={`p-2 rounded-xl transition-all ${isOverridden
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

