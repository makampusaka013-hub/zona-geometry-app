'use client';

import React, { useCallback, useEffect, useState, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Search, X, Save, Edit, ChevronDown, ChevronUp, Layers, HardHat, Package, Wrench, Info, AlertTriangle, CheckCircle2, Calculator } from 'lucide-react';
import { toast } from '@/lib/toast';
import ConversionCalculatorModal from '@/components/ConversionCalculatorModal';

function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

// Urutkan detail: Pekerja (L) → Bahan (A/B) → Alat (M) → Lainnya
function sortDetails(details) {
  if (!Array.isArray(details)) return [];
  const order = { 'upah': 0, 'bahan': 1, 'alat': 2, 'lainnya': 3 };
  return [...details].sort((a, b) => {
    const oa = order[a?.jenis_komponen] ?? 99;
    const ob = order[b?.jenis_komponen] ?? 99;
    if (oa !== ob) return oa - ob;
    // secondary sort by kode_item alphanumerically
    return (a?.kode_item || '').localeCompare(b?.kode_item || '', 'id');
  });
}

// Inline edit cell for harga konversi (Admin only)
// Inline Faktor Konversi Editor (Admin only)
// Harga Dasar di database TIDAK berubah. Hanya faktor_konversi yang disesuaikan.
// harga_konversi = harga_dasar / faktor
function InlineFaktorCell({ det, isAdmin, isPro, isAdvance, onSave }) {
  const [editing, setEditing] = useState(false);
  const [faktor, setFaktor] = useState('1');
  const [satuan, setSatuan] = useState('');
  const [saving, setSaving] = useState(false);
  const [konvData, setKonvData] = useState(null);

  // New Searchable DB State
  const [dbSearch, setDbSearch] = useState('');
  const [dbResults, setDbResults] = useState([]);
  const [showDbDropdown, setShowDbDropdown] = useState(false);
  const [selectedDbItem, setSelectedDbItem] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDbDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(async () => {
      if (!dbSearch || dbSearch.length < 2) {
        setDbResults([]);
        return;
      }
      // Search in UNION view (custom prioritas dulu, lalu resmi)
      const { data } = await supabase
        .from('view_master_harga_gabungan')
        .select('id, nama_item, harga_satuan, satuan, sumber, source_table')
        .ilike('nama_item', `%${dbSearch}%`)
        .order('urutan_prioritas', { ascending: true })
        .limit(20);
      setDbResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [dbSearch, editing]);

  async function startEdit(e) {
    e.stopPropagation();
    if (!isAdmin && !isPro && !isAdvance) return;
    // Load current konversi data
    const { data: rows } = await supabase
      .from('master_konversi')
      .select('id, faktor_konversi, satuan_ahsp, item_dasar_id, master_harga_dasar(harga_satuan, satuan, nama_item)')
      .eq('uraian_ahsp', det.uraian)
      .limit(1);
    const k = rows?.[0];
    setKonvData(k || null);
    setFaktor(String(k?.faktor_konversi ?? 1));
    setSatuan(k?.satuan_ahsp || '');
    
    // Initialize DB Item Selection
    if (k?.master_harga_dasar) {
      const initDbItem = { ...k.master_harga_dasar, id: k.item_dasar_id };
      setSelectedDbItem(initDbItem);
      setDbSearch(initDbItem.nama_item || '');
    } else {
      setSelectedDbItem(null);
      setDbSearch(det?.uraian || '');
    }

    setEditing(true);
  }

  async function commit(e) {
    e.stopPropagation();
    const f = parseFloat(faktor);
    if (isNaN(f) || f <= 0) { toast.warning('Faktor harus > 0'); return; }
    if (!konvData?.id) { toast.warning('Data konversi tidak ditemukan. Lakukan mapping terlebih dahulu.'); setEditing(false); return; }
    if (!selectedDbItem?.id) { toast.warning('Pilih harga dasar dari daftar yang tersedia.'); return; }

    setSaving(true);
    await onSave(konvData.id, f, satuan, selectedDbItem.id);
    setSaving(false);
    setEditing(false);
  }

  function cancel(e) {
    e.stopPropagation();
    setEditing(false);
  }

  if (!editing) {
    return (
      <td
        className={`px-3 py-2 text-right text-xs font-mono group ${isAdmin || isPro || isAdvance ? 'cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-700 dark:hover:text-orange-400' : 'text-slate-500'}`}
        title={isAdmin || isPro || isAdvance ? 'Klik untuk edit Faktor Konversi atau Ganti Harga Dasar' : ''}
        onClick={startEdit}
      >
        <span>{formatIdr(det?.harga_konversi)}</span>
        {(isAdmin || isPro || isAdvance) && (
          <svg className="inline ml-1 w-3 h-3 text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        )}
      </td>
    );
  }

  const hargaDasar = selectedDbItem?.harga_satuan || 0;
  const satuanDasar = selectedDbItem?.satuan || '-';
  const preview = parseFloat(faktor) > 0 ? hargaDasar / parseFloat(faktor) : 0;

  return (
    <td className="px-2 py-2 align-top" colSpan={1} onClick={e => e.stopPropagation()}>
      <div className="min-w-[320px] rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/40 p-3 shadow-md text-xs space-y-3 z-10 relative">
        
        {/* Pencarian Harga Dasar (EDITABLE) */}
        <div ref={dropdownRef} className="flex flex-col gap-1 relative text-slate-700 dark:text-slate-200">
          <label className="font-semibold text-xs">Pilih Harga Dasar (DB):</label>
          <input
            type="text"
            value={dbSearch}
            onChange={e => { setDbSearch(e.target.value); setShowDbDropdown(true); }}
            onFocus={() => setShowDbDropdown(true)}
            placeholder="Cari Master Harga Dasar..."
            className="w-full text-xs p-1.5 border border-orange-400 rounded focus:ring-1 focus:ring-orange-500 focus:outline-none bg-white dark:bg-[#0f172a]"
          />
          {showDbDropdown && dbResults.length > 0 && (
            <ul className="absolute top-[52px] left-0 w-full max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-xl z-50 divide-y divide-slate-100 dark:divide-slate-700">
               {dbResults.map(r => (
                 <li 
                   key={r.id} 
                   onClick={() => {
                     setSelectedDbItem(r);
                     setDbSearch(r.nama_item);
                     setShowDbDropdown(false);
                   }}
                   className="p-2 text-xs hover:bg-amber-100/60 dark:hover:bg-amber-900/50 cursor-pointer text-slate-800 dark:text-slate-200 transition-colors"
                 >
                   <div className="font-bold truncate flex items-center gap-1.5">
                     {r.nama_item}
                     {r.sumber === 'Custom Anda' ? (
                       <span className="text-[9px] bg-indigo-100 text-indigo-600 dark:bg-orange-900/40 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-semibold shrink-0">✏️ Custom</span>
                     ) : (
                       <span className="text-[9px] bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">🔒 PUPR</span>
                     )}
                   </div>
                   <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                     <span>{formatIdr(r.harga_satuan)} / {r.satuan}</span>
                   </div>
                 </li>
               ))}
            </ul>
          )}
          {showDbDropdown && dbResults.length === 0 && dbSearch.length >= 2 && (
            <div className="absolute top-[52px] left-0 w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-xl z-50 p-3 text-center text-xs text-slate-500">
              Tidak ditemukan
            </div>
          )}
        </div>

        {/* Info Harga Dasar Terpilih */}
        <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-slate-900/50 px-2 py-1.5 rounded">
          <span>Nilai Dasar:</span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{formatIdr(hargaDasar)}<span className="text-slate-400 ml-1 font-normal">/{satuanDasar}</span></span>
        </div>
        
        <hr className="border-amber-200 dark:border-amber-700" />
        
        {/* Faktor Input */}
        <div className="flex items-center gap-2">
          <label className="text-slate-700 dark:text-slate-300 whitespace-nowrap font-medium">Bagi (÷):</label>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={faktor}
            onChange={e => setFaktor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(e); if (e.key === 'Escape') cancel(e); }}
            className="w-20 font-mono text-center border border-orange-400 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-[#0f172a]"
          />
          <label className="text-slate-700 dark:text-slate-300 px-1 font-medium">Satuan:</label>
          <input
            type="text"
            value={satuan}
            onChange={e => setSatuan(e.target.value)}
            placeholder="m, m2..."
            className="w-16 font-mono text-center border border-orange-400 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-[#0f172a]"
          />
        </div>
        
        {/* Preview */}
        <div className="bg-white dark:bg-slate-800 rounded px-2 py-1.5 flex justify-between items-center border border-amber-200 dark:border-amber-700">
          <span className="text-slate-600 dark:text-slate-400 font-medium">Hasil Konversi:</span>
          <span className="font-mono font-bold text-lg text-emerald-700 dark:text-emerald-400">{formatIdr(preview)}</span>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button onClick={commit} disabled={saving} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-sm">
            {saving ? 'Menyimpan...' : '✓ Simpan Pembaruan'}
          </button>
          <button onClick={cancel} className="px-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded transition-colors focus:outline-none">✕</button>
        </div>
      </div>
    </td>
  );
}

// Modal Override Harga per-Baris untuk User Pro
// Muncul sebagai fixed overlay terpusat — tidak melebar ke kanan
// Data disimpan ke user_ahsp_price_override (personal, tidak mempengaruhi user lain)
function ModalUserOverride({ det, onClose, onSaved }) {
  const [mode, setMode] = useState('pilih');
  const [search, setSearch] = useState(det?.uraian || '');
  const [results, setResults] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hargaLangsung, setHargaLangsung] = useState('');
  const [tkdnLangsung, setTkdnLangsung] = useState('0');
  const [saving, setSaving] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const dropRef = useRef(null);
  
  // Konversi Factor
  const [faktor, setFaktor] = useState(1);
  const [showCalc, setShowCalc] = useState(false);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (mode !== 'pilih') return;
    const timer = setTimeout(async () => {
      if (!search || search.length < 2) { setResults([]); return; }
      const { data } = await supabase
        .from('view_master_harga_gabungan')
        .select('id, nama_item, harga_satuan, tkdn_percent, satuan, sumber, source_table')
        .ilike('nama_item', `%${search}%`)
        .order('urutan_prioritas', { ascending: true })
        .limit(15);
      setResults(data || []);
      setShowDrop(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, mode]);

  async function handleSave() {
    if (!det?.detail_id) {
      toast.error('detail_id tidak tersedia. Hubungi admin.');
      return;
    }

    // Ambil user_id secara eksplisit dari session aktif
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sesi login tidak valid.'); return; }

    setSaving(true);
    let payload = {
      ahsp_detail_id: det.detail_id,
      user_id: user.id,          // ← WAJIB: agar RLS policy USING(user_id = auth.uid()) terpenuhi
    };

    if (mode === 'langsung') {
      const h = parseFloat(hargaLangsung);
      const t = parseFloat(tkdnLangsung);
      if (isNaN(h) || h < 0) { toast.warning('Harga tidak valid'); setSaving(false); return; }
      payload = { ...payload, harga_langsung: h, tkdn_langsung: isNaN(t) ? 0 : t, harga_item_id: null, source_table: null };
    } else {
      if (!selectedItem) { toast.warning('Pilih item dari daftar terlebih dahulu.'); setSaving(false); return; }
      
      // Jika ada faktor konversi, kita ubah menjadi mode 'langsung' tapi tetap mencatat item referensinya?
      // Sayangnya schema saat ini saling eksklusif. Kita simpan sebagai harga_langsung saja 
      // agar volumenya tetap konsisten dengan Analisa PUPR.
      const f = parseFloat(faktor);
      if (f !== 1 && f > 0) {
        const finalPrice = selectedItem.harga_satuan / f;
        payload = { 
          ...payload, 
          harga_langsung: finalPrice, 
          tkdn_langsung: selectedItem.tkdn_percent || 0,
          harga_item_id: null, 
          source_table: null 
        };
      } else {
        payload = { ...payload, harga_item_id: selectedItem.id, source_table: selectedItem.source_table, harga_langsung: null, tkdn_langsung: null };
      }
    }

    const { error } = await supabase
      .from('user_ahsp_price_override')
      .upsert(payload, { onConflict: 'user_id,ahsp_detail_id' });
    
    setSaving(false);
    if (error) { toast.error('Gagal simpan override: ' + error.message); return; }
    onSaved?.();
  }

  return (
    /* Fixed overlay terpusat — tidak bergeser ke kanan */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-indigo-200 dark:border-orange-800" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">🔧 Ganti Sumber Harga</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[240px]" title={det?.uraian}>
              ↳ {det?.uraian}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5 pt-4 flex gap-1.5">
          <button onClick={() => setMode('pilih')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'pilih' ? 'bg-indigo-600 dark:bg-orange-600 text-white shadow' : 'text-indigo-600 dark:bg-orange-400 border border-indigo-300 dark:border-orange-800 hover:bg-indigo-50 dark:hover:bg-orange-900/20'}`}>
            📋 Pilih dari Katalog
          </button>
          <button onClick={() => setMode('langsung')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'langsung' ? 'bg-indigo-600 dark:bg-orange-600 text-white shadow' : 'text-indigo-600 dark:bg-orange-400 border border-indigo-300 dark:border-orange-800 hover:bg-indigo-50 dark:hover:bg-orange-900/20'}`}>
            ✏️ Input Langsung
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {mode === 'pilih' ? (
            <div ref={dropRef} className="relative">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDrop(true); }}
                onFocus={() => setShowDrop(true)}
                placeholder="Cari item dari Katalog (PUPR + Custom Anda)..."
                className="w-full text-sm border border-indigo-300 dark:border-orange-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500"
              />
              {showDrop && results.length > 0 && (
                <ul className="absolute top-[42px] left-0 right-0 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 rounded-xl shadow-2xl z-50 divide-y divide-slate-100 dark:divide-slate-700">
                  {results.map(r => (
                    <li key={r.id} onClick={() => { setSelectedItem(r); setSearch(r.nama_item); setShowDrop(false); }}
                      className="px-3 py-2 hover:bg-violet-50 dark:hover:bg-violet-900/40 cursor-pointer">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {r.nama_item}
                        {r.sumber === 'Custom Anda'
                          ? <span className="text-[9px] bg-indigo-100 text-indigo-600 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full">✏️ Custom</span>
                          : <span className="text-[9px] bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 px-1.5 py-0.5 rounded-full">🔒 PUPR</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{formatIdr(r.harga_satuan)} / {r.satuan}</div>
                    </li>
                  ))}
                </ul>
              )}
              {selectedItem && (
                <div className="space-y-2 mt-3 p-3 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-xl">
                  <div className="flex justify-between items-center text-[10px] text-violet-600 dark:text-violet-300 font-bold uppercase tracking-wider">
                    <span>Item Terpilih</span>
                    <span className="font-mono">{formatIdr(selectedItem.harga_satuan)}/{selectedItem.satuan}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-1 border-t border-violet-100 dark:border-violet-800">
                    <div className="flex-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Faktor Bagi (÷)</label>
                      <input 
                        type="number" step="0.001" value={faktor} onChange={e => setFaktor(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border-2 border-violet-200 dark:border-violet-700 rounded-lg px-2 py-1.5 text-xs font-black outline-none focus:border-violet-500"
                      />
                    </div>
                    <button 
                      onClick={() => setShowCalc(true)}
                      className="mt-4 p-2 bg-white dark:bg-slate-700 border border-violet-300 dark:border-violet-600 rounded-lg text-violet-600 dark:text-violet-300 hover:bg-violet-50 transition-colors"
                      title="Hitung Faktor Konversi"
                    >
                       <Calculator className="w-4 h-4" />
                    </button>
                  </div>

                  {parseFloat(faktor) !== 1 && parseFloat(faktor) > 0 && (
                    <div className="flex justify-between items-center pt-1 border-t border-dashed border-violet-200 dark:border-violet-700">
                       <span className="text-[9px] font-bold text-slate-400">Harga Akhir:</span>
                       <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatIdr(selectedItem.harga_satuan / parseFloat(faktor))}
                       </span>
                    </div>
                  )}
                </div>
              )}
              
              <ConversionCalculatorModal 
                isOpen={showCalc}
                onClose={() => setShowCalc(false)}
                onApply={(val) => { setFaktor(val); setShowCalc(false); }}
                initialTitle="Hitung Faktor Konversi"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Harga / Satuan (Rp)</label>
                <input type="number" value={hargaLangsung} onChange={e => setHargaLangsung(e.target.value)}
                  placeholder="0"
                  className="w-full text-sm font-mono border border-violet-300 dark:border-violet-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">TKDN % (0 – 100)</label>
                <input type="number" step="0.01" min="0" max="100" value={tkdnLangsung} onChange={e => setTkdnLangsung(e.target.value)}
                  className="w-full text-sm font-mono border border-green-300 dark:border-green-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 text-center">
            ℹ️ Perubahan ini hanya berlaku untuk Anda. User lain tidak terpengaruh.
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Batal</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-xl bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            {saving ? 'Menyimpan...' : '✓ Simpan Override'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Wrapper kecil yang ditampilkan di dalam cell tabel
function InlineUserOverrideCell({ det, isPro, onSaved }) {
  const [showModal, setShowModal] = useState(false);
  // Badge '✓ Custom' hanya tampil jika user memilih harga dari katalog Custom
  // atau mengisi harga langsung — bukan saat pilih dari PUPR
  const isCustomOverride = det?.sumber_harga === 'override-custom'
    || det?.sumber_harga === 'override-langsung';
  // Ada override apapun (untuk tombol reset)
  const hasAnyOverride = det?.sumber_harga
    && !['pupr-auto', 'pupr-mapped', 'kosong'].includes(det.sumber_harga);

  async function handleReset(e) {
    e.stopPropagation();
    if (!det?.detail_id) return;
    const confirmed = await toast.confirm('Reset ke harga default PUPR?', 'Sumber harga item ini akan dikembalikan ke standar resmi PUPR.');
    if (!confirmed) return;
    await supabase.from('user_ahsp_price_override').delete().eq('ahsp_detail_id', det.detail_id);
    onSaved?.();
  }

  if (!isPro) return null;

  return (
    <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
      {/* Modal overlay terpusat */}
      {showModal && (
        <ModalUserOverride
          det={det}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); onSaved?.(); }}
        />
      )}

      <div className="flex items-center justify-center gap-1">
        {isCustomOverride && (
          <span className="text-[9px] bg-indigo-100 text-indigo-600 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-semibold">✓ Custom</span>
        )}
        <button
          onClick={() => setShowModal(true)}
          className="text-[11px] text-indigo-600 dark:text-orange-400 hover:text-indigo-800 dark:hover:text-orange-200 border border-indigo-300 dark:border-orange-700 hover:border-indigo-500 px-1.5 py-0.5 rounded-lg transition-colors font-semibold"
          title="Ganti sumber harga"
        >
          🔧
        </button>
        {hasAnyOverride && (
          <button onClick={handleReset} title="Reset ke PUPR" className="text-[10px] text-red-400 hover:text-red-600 px-1 rounded">✕</button>
        )}
      </div>
    </td>
  );
}




// =============================================================================
// MODAL: TAMBAH / EDIT HSP CUSTOM
// =============================================================================
function ModalHspCustom({ isOpen, onClose, ahspId, onSaved, currentUserId }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    kode: '',
    nama: '',
    satuan: 'm2',
    kategori: 'Pekerjaan Persiapan',
    profit: 10,
    details: []
  });

  // Search Resource State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [activeCalcItemId, setActiveCalcItemId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (ahspId) {
      loadEditData(ahspId);
    } else {
      setForm({
        kode: '',
        nama: '',
        satuan: 'm2',
        kategori: 'Pekerjaan Persiapan',
        profit: 10,
        details: []
      });
    }
  }, [isOpen, ahspId]);

  async function loadEditData(id) {
    setLoading(true);
    const { data, error } = await supabase
      .from('view_katalog_ahsp_custom')
      .select('*')
      .eq('master_ahsp_id', id)
      .single();
    
    if (data) {
      // Map view details to form details (item_id and source_table are needed)
      // Since view_katalog_ahsp_custom might not have item_id/source_table in details yet (only display info),
      // we need to fetch from the source table directly.
      const { data: rawDetails } = await supabase
        .from('master_ahsp_details_custom')
        .select('item_id, source_table, koefisien')
        .eq('ahsp_id', id);

      // Fetch display info for these items
      const itemIds = rawDetails.map(d => d.item_id);
      const { data: itemInfos } = await supabase
        .from('view_master_harga_gabungan')
        .select('id, nama_item, kode_item, satuan, harga_satuan, tkdn_percent, kategori_item, source_table')
        .in('id', itemIds);

      const mappedDetails = rawDetails.map(d => {
        const info = itemInfos?.find(i => i.id === d.item_id && i.source_table === d.source_table);
        return {
          item_id: d.item_id,
          source_table: d.source_table,
          koefisien: d.koefisien,
          // Extra info for UI
          nama_item: info?.nama_item || 'Tidak diketahui',
          kode_item: info?.kode_item || '-',
          satuan: info?.satuan || '-',
          harga: info?.harga_satuan || 0,
          tkdn: info?.tkdn_percent || 0,
          kategori: info?.kategori_item || 'Bahan'
        };
      });

      setForm({
        kode: data.kode_ahsp,
        nama: data.nama_pekerjaan,
        satuan: data.satuan_pekerjaan,
        kategori: data.kategori_pekerjaan,
        profit: data.overhead_profit,
        details: mappedDetails
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('view_master_harga_gabungan')
        .select('*')
        .ilike('nama_item', `%${searchQuery}%`)
        .order('urutan_prioritas', { ascending: true })
        .limit(10);
      setSearchResults(data || []);
      setShowSearch(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function addDetail(item) {
    if (form.details.some(d => d.item_id === item.id)) {
      toast.warning('Item sudah ada dalam rincian.');
      return;
    }
    setForm(prev => ({
      ...prev,
      details: [
        ...prev.details,
        {
          item_id: item.id,
          source_table: item.source_table,
          koefisien: 0,
          nama_item: item.nama_item,
          kode_item: item.kode_item,
          satuan: item.satuan,
          harga: item.harga_satuan,
          tkdn: item.tkdn_percent,
          kategori: item.kategori_item
        }
      ]
    }));
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  }

  function removeDetail(itemId) {
    setForm(prev => ({
      ...prev,
      details: prev.details.filter(d => d.item_id !== itemId)
    }));
  }

  function updateKoef(itemId, val) {
    setForm(prev => ({
      ...prev,
      details: prev.details.map(d => d.item_id === itemId ? { ...d, koefisien: parseFloat(val) || 0 } : d)
    }));
  }

  async function handleSave() {
    if (!form.kode || !form.nama) { toast.warning('Kode dan Nama wajib diisi.'); return; }
    if (form.details.length === 0) { toast.warning('Rincian analisa tidak boleh kosong.'); return; }
    
    setSaving(true);
    const payload = {
      p_id: ahspId,
      p_kode: form.kode,
      p_nama: form.nama,
      p_satuan: form.satuan,
      p_kategori: form.kategori,
      p_profit: form.profit,
      p_details: form.details.map(d => ({
        item_id: d.item_id,
        source_table: d.source_table,
        koefisien: d.koefisien
      }))
    };

    const { data, error } = await supabase.rpc('save_custom_ahsp', payload);
    setSaving(false);
    if (error) {
      toast.error('Gagal simpan: ' + error.message);
    } else {
      onSaved?.();
      onClose();
    }
  }

  if (!isOpen) return null;

  // Totals Calculation
  const totalUpah = form.details.filter(d => d.kategori === 'Upah').reduce((s, d) => s + (d.harga * d.koefisien), 0);
  const totalBahan = form.details.filter(d => d.kategori === 'Bahan').reduce((s, d) => s + (d.harga * d.koefisien), 0);
  const totalAlat = form.details.filter(d => d.kategori === 'Alat').reduce((s, d) => s + (d.harga * d.koefisien), 0);
  const subtotal = totalUpah + totalBahan + totalAlat;
  const profitAmt = subtotal * (form.profit / 100);
  const grandTotal = subtotal + profitAmt;

  const totalTkdnVal = form.details.reduce((s, d) => s + (d.harga * d.koefisien * (d.tkdn / 100)), 0);
  const totalTkdnPercent = subtotal > 0 ? (totalTkdnVal / subtotal) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
               <Layers className="w-4 h-4 text-indigo-600 dark:text-orange-500" />
               {ahspId ? 'Edit AHSP Custom' : 'Tambah AHSP Baru'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Membangun analisa harga satuan mandiri yang hanya bisa dilihat oleh Anda</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Section 1: Identitas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kode HSP *</label>
              <input 
                type="text" 
                value={form.kode} 
                onChange={e => setForm({...form, kode: e.target.value})}
                placeholder="cth: HSP.001"
                className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Pekerjaan *</label>
              <input 
                type="text" 
                value={form.nama} 
                onChange={e => setForm({...form, nama: e.target.value})}
                placeholder="cth: Pembuatan 1 m' Pagar Sementara"
                className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Satuan *</label>
              <input 
                type="text" 
                value={form.satuan} 
                onChange={e => setForm({...form, satuan: e.target.value})}
                placeholder="m2, m', kg..."
                className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kategori / Divisi</label>
              <input 
                type="text" 
                value={form.kategori} 
                onChange={e => setForm({...form, kategori: e.target.value})}
                className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Overhead + Profit (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={form.profit} 
                  onChange={e => setForm({...form, profit: parseFloat(e.target.value) || 0})}
                  className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-700" />

          {/* Section 2: Rincian Analisa */}
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5" /> Rincian Komponen Analisa
              </h3>
              
              <div className="relative" ref={searchRef}>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onFocus={() => setShowSearch(true)}
                    onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
                    placeholder="Cari Item untuk ditambahkan..."
                    className="bg-transparent text-xs font-medium text-slate-900 dark:text-white border-0 focus:ring-0 placeholder:text-slate-400 w-64"
                  />
                </div>
                
                {showSearch && searchResults.length > 0 && (
                  <div className="absolute top-full right-0 mt-2 w-[450px] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[110] overflow-hidden">
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700 max-h-72 overflow-y-auto">
                      {searchResults.map(res => (
                        <li 
                          key={`${res.id}-${res.source_table}`} 
                          onClick={() => addDetail(res)}
                          className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer group flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{res.nama_item}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] font-mono text-slate-400">{res.kode_item}</span>
                              <span className="text-[9px] text-indigo-600 dark:text-orange-400 font-bold uppercase">{res.kategori_item}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] font-bold text-slate-900 dark:text-white">{formatIdr(res.harga_satuan)}</div>
                            <div className="text-[8px] text-slate-400 uppercase font-black tracking-widest">/{res.satuan}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase font-bold text-[9px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Komponen</th>
                    <th className="px-4 py-3 text-center">Satuan</th>
                    <th className="px-4 py-3 text-center w-28">Koefisien</th>
                    <th className="px-4 py-3 text-right">Harga Dasar</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-center">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {form.details.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400 italic">
                        Belum ada rincian analisa. Cari item di kolom atas.
                      </td>
                    </tr>
                  ) : (
                    form.details.map((det, idx) => (
                      <tr key={det.item_id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{det.nama_item}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                det.kategori === 'Upah' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                                det.kategori === 'Bahan' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                                'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                              }`}>{det.kategori}</span>
                              <span className="text-[9px] text-slate-400 font-mono">{det.kode_item}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 font-medium">{det.satuan}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="relative group/k">
                            <input 
                              type="number" 
                              step="0.00001" 
                              value={det.koefisien}
                              onChange={e => updateKoef(det.item_id, e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-center text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                            />
                            <button 
                              onClick={() => { setActiveCalcItemId(det.item_id); setShowCalculator(true); }}
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-slate-100 dark:bg-slate-700 rounded opacity-0 group-hover/k:opacity-100 transition-opacity text-indigo-600 dark:text-orange-400"
                              title="Hitung Konversi"
                            >
                              <Calculator className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">{formatIdr(det.harga)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-white">{formatIdr(det.harga * det.koefisien)}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => removeDetail(det.item_id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Summary Display */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-6 justify-around items-center">
              <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Upah</div>
                <div className="text-xs font-bold text-blue-700 dark:text-blue-400">{formatIdr(totalUpah)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bahan</div>
                <div className="text-xs font-bold text-green-700 dark:text-green-400">{formatIdr(totalBahan)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Alat</div>
                <div className="text-xs font-bold text-orange-700 dark:text-orange-400">{formatIdr(totalAlat)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Potensi TKDN</div>
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">{totalTkdnPercent.toFixed(2)}%</div>
              </div>
            </div>
            
            <div className="bg-indigo-600 dark:bg-orange-600 rounded-xl p-4 flex flex-col justify-center shadow-lg shadow-indigo-600/20 dark:shadow-orange-600/10">
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-0.5 text-center">Total Harga Satuan</div>
              <div className="text-lg font-black text-white text-center font-mono">
                {formatIdr(grandTotal)}
              </div>
              <div className="text-[8px] font-medium text-white/40 uppercase tracking-widest text-center">Inkl. {form.profit}% Profit</div>
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-500">
            <Info className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Tersimpan di Katalog AHSP Custom Anda</span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-white dark:hover:bg-slate-800 transition-all font-semibold"
            >
              Batal
            </button>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-2 rounded-lg bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white text-xs font-bold uppercase tracking-widest shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 font-semibold"
            >
              {saving ? <div className="h-3 w-3 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Save className="w-4 h-4" />}
              {saving ? 'Menyimpan...' : 'Simpan AHSP'}
            </button>
          </div>
        </div>

        <ConversionCalculatorModal 
          isOpen={showCalculator}
          onClose={() => setShowCalculator(false)}
          onApply={(val) => {
            if (activeCalcItemId) {
               updateKoef(activeCalcItemId, val);
            }
            setShowCalculator(false);
          }}
          initialTitle="Kalkulator Koefisien AHSP"
        />

      </div>
    </div>
  );
}




export default function KatalogAhspPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [memberRole, setMemberRole] = useState('view');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showHspModal, setShowHspModal] = useState(false);
  const [editHspId, setEditHspId] = useState(null);
  
  // Data
  const [data, setData] = useState([]);
  const [completeCount, setCompleteCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  
  // UI State
  const [query, setQuery] = useState('');
  const [jenisFilter, setJenisFilter] = useState('');
  const [jenisOptions, setJenisOptions] = useState([]);
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const isAdmin = memberRole === 'admin';
  const isPro = memberRole === 'pro';
  const isAdvance = memberRole === 'advance';
  const canViewStats = isAdmin || isPro || isAdvance;
  const canAddCustom = isAdmin || isPro || isAdvance;

  const [selectedLocationId, setSelectedLocationId] = useState(null);

  const checkAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    setCurrentUserId(user.id);
    const { data: m } = await supabase.from('members').select('role, selected_location_id').eq('user_id', user.id).maybeSingle();
    setMemberRole(m?.role || 'view');
    setSelectedLocationId(m?.selected_location_id || null);
  }, [router]);

  const loadStats = useCallback(async () => {
    try {
      // Query counts separately for PUPR (Analisa) and Custom to avoid UNION count issues
      const [puprComplete, puprIncomplete, customComplete, customIncomplete] = await Promise.all([
        supabase.from('view_analisa_ahsp').select('*', { count: 'exact', head: true }).eq('is_lengkap', true),
        supabase.from('view_analisa_ahsp').select('*', { count: 'exact', head: true }).eq('is_lengkap', false),
        supabase.from('view_katalog_ahsp_custom').select('*', { count: 'exact', head: true }).eq('is_lengkap', true),
        supabase.from('view_katalog_ahsp_custom').select('*', { count: 'exact', head: true }).eq('is_lengkap', false)
      ]);

      const totalComplete = (puprComplete.count || 0) + (customComplete.count || 0);
      const totalIncomplete = (puprIncomplete.count || 0) + (customIncomplete.count || 0);

      setCompleteCount(totalComplete);
      setIncompleteCount(totalIncomplete);

      // Fetch options for the filter
      const { data } = await supabase.from('master_ahsp').select('jenis_pekerjaan').limit(2000);
      if(data) {
         const unique = [...new Set(data.map(d => d.jenis_pekerjaan).filter(Boolean))].sort();
         setJenisOptions(unique);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  const loadData = useCallback(async () => {
    // JANGAN LOAD jika lokasi belum terpilih (biasanya saat awal login)
    if (!selectedLocationId) {
      console.log('KatalogAHSP: Waiting for location context...');
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Gunakan RPC v2 yang jauh lebih cepat dan sudah teroptimasi regional
    const { data: rows, error } = await supabase.rpc('get_ahsp_catalog_v2', {
      p_location_id: selectedLocationId,
      p_query: query,
      p_jenis_filter: jenisFilter,
      p_show_incomplete: showIncomplete,
      p_limit: limit,
      p_offset: (page - 1) * limit
    });
    
    if (error) {
      console.error('RPC get_ahsp_catalog_v2 error:', error);
      setErrorMsg(error.message);
      setData([]);
    } else {
      setErrorMsg('');
      // Transform keys to match expected object structure if necessary
      // (RPC v2 returned keys are same as view names in the migration)
      setData(rows || []);
    }
    setLoading(false);
  }, [page, limit, query, showIncomplete, jenisFilter, selectedLocationId]);

  useEffect(() => {
    checkAuth().then(() => {
      loadStats();
      loadData();
    });
  }, [checkAuth, loadStats, loadData]);

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }

  async function handleEditHsp(id) {
    setEditHspId(id);
    setShowHspModal(true);
  }

  async function handleDeleteHsp(e, id) {
    e.stopPropagation();
    const confirmed = await toast.confirm('Hapus analisa HSP Custom?', 'Data ini akan dihapus permanen dari aplikasi Anda.');
    if (!confirmed) return;
    const { error } = await supabase.from('master_ahsp_custom').delete().eq('id', id);
    if (error) toast.error('Gagal hapus: ' + error.message);
    else {
      showToast('✅ AHSP Custom berhasil dihapus.');
      loadData();
      loadStats();
    }
  }

  // Pro: reload satu baris AHSP setelah user melakukan override harga
  async function handleReloadSingleRow(ahspId) {
    const { data: updated } = await supabase
      .from('view_katalog_ahsp_lengkap')
      .select('*')
      .eq('master_ahsp_id', ahspId)
      .maybeSingle();
    if (updated) {
      setData(prev => prev.map(r => r.master_ahsp_id === ahspId ? updated : r));
      showToast('✅ Harga berhasil diperbarui!');
    }
  }

  // Admin: update faktor_konversi and/or item_dasar_id in master_konversi
  async function handleSaveFaktor(konvId, newFaktor, newSatuan, newItemDasarId) {
    try {
      const updateData = {
        faktor_konversi: newFaktor,
        satuan_ahsp: newSatuan || null,
      };
      
      if (newItemDasarId !== undefined) {
        updateData.item_dasar_id = newItemDasarId;
      }

      const { error } = await supabase
        .from('master_konversi')
        .update(updateData)
        .eq('id', konvId);

      if (error) throw error;

      showToast(`✅ Konversi AHSP berhasil diperbarui!`);
      await loadData();
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message);
    }
  }

  async function handleResetAllAhspOverrides() {
    const confirmed = await toast.confirm(
      'Reset SELURUH "Ganti Sumber Harga"?',
      'Tindakan ini akan menghapus semua kustomisasi personal Anda di AHSP dan mengembalikannya ke standar PUPR.'
    );
    if (!confirmed) return;
    setLoading(true);
    const { error } = await supabase
      .from('user_ahsp_price_override')
      .delete()
      .eq('user_id', currentUserId);

    if (error) {
       toast.error('Gagal reset: ' + error.message);
    } else {
       showToast('✅ Seluruh Analisa AHSP telah dikembalikan ke standar PUPR.');
       loadData();
    }
    setLoading(false);
  }

  return (
    <div className="bg-slate-50 dark:bg-[#0f172a]">

      {/* TOAST */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl animate-pulse">
          {toastMsg}
        </div>
      )}

      {/* HEADER */}
      <div className="text-center py-6 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
         <h1 className="text-[16px] uppercase font-bold text-slate-900 dark:text-slate-100 tracking-wide">ANALISA HARGA SATUAN</h1>
         <p className="text-[8px] text-slate-600 dark:text-slate-400 mt-1 uppercase tracking-wider">AHSP CIPTA KARYA SE BINA KONSTRUKSI NO 182 TAHUN 2025</p>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {errorMsg && (
          <div className="mb-4 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-400 text-sm">
            {errorMsg}
          </div>
        )}

        {(isAdmin || isPro || isAdvance) && (
          <div className="mb-4 flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-amber-700 dark:text-amber-400">
            <span>✏️</span>
            <span><strong>Mode Editor:</strong> Anda dapat menambah HSP Custom dan mengedit Faktor Konversi (klik angka Harga Sat. pada baris uraian). Analisa Resmi PUPR tetap terjaga.</span>
          </div>
        )}

        {/* TOOLS BAR & STATS */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            {canViewStats && (
              <div className="flex gap-4 p-3 bg-white dark:bg-[#1e293b] rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-[10px] uppercase font-bold tracking-wider">
                <div className="text-green-700 dark:text-green-500">Lengkap: {completeCount}</div>
                <div className="text-rose-700 dark:text-rose-500">Belum Lengkap: {incompleteCount}</div>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap items-center ml-auto">
            {canAddCustom && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditHspId(null); setShowHspModal(true); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white text-sm font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Tambah AHSP Custom
                </button>
                <button
                  onClick={handleResetAllAhspOverrides}
                  className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Reset semua ganti sumber harga ke PUPR"
                >
                  <Trash2 className="w-4 h-4 inline mr-2" />
                  Reset ke PUPR
                </button>
              </div>
            )}
            <select value={jenisFilter} onChange={e => {setJenisFilter(e.target.value); setPage(1);}} className="text-sm border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 py-2 max-w-[200px] truncate">
              <option value="">Semua Jenis Pekerjaan</option>
              {jenisOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <select value={limit} onChange={e => {setLimit(Number(e.target.value)); setPage(1);}} className="text-sm border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 py-2">
              <option value={10}>10 Baris</option>
              <option value={20}>20 Baris</option>
              <option value={50}>50 Baris</option>
              <option value={100}>100 Baris</option>
            </select>
          </div>
        </div>

        {/* SEARCH BAR GLOBAL */}
        <div className="mb-6 p-4 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 shadow-sm flex items-center">
           <svg className="w-5 h-5 text-slate-400 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
           </svg>
           <input 
              placeholder="Ketik Kode atau Nama Pekerjaan untuk mencari di seluruh Database..." 
              value={query} 
              onChange={e => { setQuery(e.target.value); setPage(1); }} 
              className="w-full border-0 bg-transparent text-sm focus:outline-none focus:ring-0 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 font-medium" 
           />
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-[#1e293b]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-indigo-600 dark:bg-amber-600 text-white">
              <tr>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">KODE</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">NAMA PEKERJAAN</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">SAT.</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">KOEFISIEN</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">
                  HARGA SAT. {isAdmin && <span className="text-amber-200 text-[9px] font-normal">(admin: klik = edit faktor)</span>}
                </th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL UPAH</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL BAHAN</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL ALAT</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">PROFIT</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL HARGA</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">TKDN</th>
                {(isAdmin || isPro || isAdvance) && (
                  <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center text-violet-200">Edit</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={12} className="text-center py-10 text-slate-500">Memuat data...</td></tr>
              ) : data.length === 0 ? (
                <tr>
                   <td colSpan={12} className="text-center py-12">
                     <p className="text-slate-500 dark:text-slate-400 font-medium text-base">Tidak ada AHSP yang Lengkap.</p>
                     {!showIncomplete && incompleteCount > 0 && (
                        <p className="text-amber-600 dark:text-amber-500 mt-2 text-xs bg-amber-50 dark:bg-amber-900/20 inline-block px-3 py-1.5 rounded-full">
                          💡 Ada {incompleteCount} AHSP di database, namun disembunyikan karena belum memiliki Total Harga (Rp 0).<br/>
                          Centang tuas <b>&quot;Tampilkan Semua&quot;</b> di atas jika Anda ingin melihatnya.
                        </p>
                     )}
                   </td>
                </tr>
              ) : (
                data.map((row, index) => {
                  if (!row) return null;
                  const rowKey = row.master_ahsp_id || `ahsp-${index}`;
                  const isExpanded = expandedRows.has(rowKey);
                  const isIncomplete = row.is_lengkap === false;
                  
                  const profitAmt = row.total_subtotal * ((row.overhead_profit || 0) / 100);
                  const totalHarga = row.total_subtotal + profitAmt;

                  // Sort details: Pekerja → Bahan → Alat
                  const sortedDetails = sortDetails(row.details);

                  return (
                    <Fragment key={rowKey}>
                      {/* MAIN ROW */}
                        <tr 
                          onClick={() => toggleRow(rowKey)}
                          className={`cursor-pointer transition-colors shadow-sm ${row.is_custom 
                            ? 'bg-indigo-50/70 hover:bg-indigo-100/90 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50' 
                            : (isIncomplete ? 'bg-rose-50/50 dark:bg-rose-900/10 hover:bg-rose-100/50' : 'bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all')
                          }`}
                        >
                          <td className="px-3 py-3 font-mono text-xs font-semibold text-indigo-700 dark:text-orange-400">
                            {isIncomplete && <span className="mr-1 text-rose-500 text-[10px]" title="Belum Lengkap">⚠️</span>}
                            <div className="flex items-center gap-2">
                              {row.kode_ahsp}
                              {row.is_custom && (
                                <span className="text-[7px] bg-indigo-600 dark:bg-orange-600 text-white px-1.5 py-0.5 rounded-md font-black tracking-widest uppercase">Custom</span>
                              )}
                            </div>
                          </td>
                        <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-normal min-w-[200px]">
                           {row.nama_pekerjaan}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-400 font-mono text-xs">{row.satuan_pekerjaan}</td>
                        <td className="px-3 py-3"></td>
                        <td className="px-3 py-3"></td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatIdr(row.total_upah)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatIdr(row.total_bahan)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatIdr(row.total_alat)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-slate-500">
                           <div>{row.overhead_profit}%</div>
                           <div className="text-[10px] opacity-70">+{formatIdr(profitAmt)}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{formatIdr(totalHarga)}</td>
                        <td className="px-3 py-3 text-center font-mono text-xs text-green-700 dark:text-green-400">{Number(row.total_tkdn_percent || 0).toFixed(2)}%</td>
                        {/* Kolom Edit */}
                        {(isAdmin || isPro || isAdvance) && (
                          <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                            {row.is_custom ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => handleEditHsp(row.master_ahsp_id)} className="p-1.5 text-indigo-600 dark:text-orange-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all" title="Edit Analisa">
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={(e) => handleDeleteHsp(e, row.master_ahsp_id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all" title="Hapus AHSP">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : null}
                          </td>
                        )}
                      </tr>

                      {/* DETAIL ROWS (EXPANDED) - sorted: L → A/B → M */}
                      {isExpanded && sortedDetails.map((det, idx) => {
                        const isDetEmpty = !det.subtotal || det.subtotal === 0;
                        const jenisBadge = {
                          upah: { label: 'Pekerja', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
                          bahan: { label: 'Bahan', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
                          alat: { label: 'Alat', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
                          lainnya: { label: 'Lain', cls: 'bg-slate-100 text-slate-500' },
                        }[det?.jenis_komponen] || { label: '-', cls: 'bg-slate-100 text-slate-500' };

                        return (
                          <tr key={idx} className={`group ${isDetEmpty ? 'bg-rose-100/50 dark:bg-rose-900/30' : 'bg-slate-50 dark:bg-slate-800/50'} border-b border-dashed border-slate-200 dark:border-slate-700 last:border-b-0`}>
                            <td className="px-3 py-2 text-right">
                               {isDetEmpty && <span className="mr-1 text-rose-500 text-[10px]" title="Harga Dasar 0">⚠️</span>}
                               <span className="text-[10px] text-slate-400 font-mono">{det?.kode_item}</span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 pl-6 border-l-2 border-indigo-200 dark:border-orange-500/20 whitespace-normal">
                               <span className={`mr-2 text-[9px] font-semibold px-1.5 py-0.5 rounded ${jenisBadge.cls}`}>{jenisBadge.label}</span>
                               ↳ {det?.uraian}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-slate-500">{det?.satuan}</td>
                            <td className="px-3 py-2 text-center text-xs font-mono text-slate-500">{det?.koefisien}</td>
                            {/* Editable faktor cell - Admin only (harga dasar tidak berubah) */}
                            <InlineFaktorCell det={det} isAdmin={isAdmin} isPro={isPro} isAdvance={isAdvance} onSave={handleSaveFaktor} />
                            <td className="px-3 py-2 text-right text-xs font-mono text-slate-500 bg-slate-100/50 dark:bg-slate-800">
                               {det?.jenis_komponen === 'upah' ? formatIdr(det?.subtotal) : '-'}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono text-slate-500 bg-slate-100/50 dark:bg-slate-800">
                               {det?.jenis_komponen === 'bahan' ? formatIdr(det?.subtotal) : '-'}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono text-slate-500 bg-slate-100/50 dark:bg-slate-800">
                               {det?.jenis_komponen === 'alat' ? formatIdr(det?.subtotal) : '-'}
                            </td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2 text-center text-xs font-mono text-slate-500">{Number(det?.tkdn || 0).toFixed(2)}%</td>
                            <InlineUserOverrideCell
                               det={det}
                               isPro={isPro || isAdmin || isAdvance}
                               onSaved={() => handleReloadSingleRow(row.master_ahsp_id)}
                             />
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        <div className="mt-4 flex items-center justify-between">
           <button 
             disabled={page === 1} 
             onClick={() => setPage(p => p - 1)}
             className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50"
           >
             Sebelumnya
           </button>
           <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Halaman {page}</span>
           <button 
             disabled={data.length < limit}
             onClick={() => setPage(p => p + 1)}
             className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50"
           >
             Selanjutnya
           </button>
        </div>

        {/* MODAL HSP CUSTOM */}
        <ModalHspCustom 
          isOpen={showHspModal} 
          onClose={() => setShowHspModal(false)} 
          ahspId={editHspId}
          currentUserId={currentUserId}
          onSaved={() => {
            showToast(editHspId ? '✅ AHSP Custom berhasil diperbarui!' : '✅ AHSP Custom berhasil ditambahkan!');
            loadData();
            loadStats();
          }}
        />

      </main>
    </div>
  );
}
