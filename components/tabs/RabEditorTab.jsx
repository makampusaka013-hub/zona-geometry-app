'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '../Spinner';
import { supabase } from '@/lib/supabase';
import { ClipboardList, Save, CheckCircle2, ShieldAlert, XCircle, RotateCcw, ChevronDown, Plus, Trash2, AlertCircle, Edit3, Trash, LayoutGrid, Package, Info, Settings, Calculator, Check, MapPin, Calendar, Box } from 'lucide-react';
import LocationSelect from '@/components/LocationSelect';

// Helper Utilities
function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim();
  if (!s) return 0;

  // Hapus Rp dan spasi
  s = s.replace(/Rp/g, '').replace(/\s/g, '');

  // Logika Format Indonesia (titik ribuan, koma desimal) vs JS (titik desimal)
  // Jika ada koma, asumsikan itu desimal. Hapus semua titik, ganti koma jadi titik.
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Jika tidak ada koma tapi ada lebih dari satu titik, asumsikan titik itu ribuan.
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      s = s.replace(/\./g, '');
    }
    // Jika hanya satu titik, JS parseFloat sudah benar (menganggap desimal).
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(n || 0);
}

function toRoman(num) {
  const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
  let roman = '';
  for (let i in lookup) {
    while (num >= lookup[i]) {
      roman += i;
      num -= lookup[i];
    }
  }
  return roman;
}

function generateNextCode(type, sections, dbMax = 0) {
  const prefix = type === 'lumsum' ? 'LS.' : 'AN.';
  let max = type === 'lumsum' ? dbMax : 0;

  sections.forEach(sec => {
    sec.lines.forEach(row => {
      if (row.masterAhspKode && row.masterAhspKode.startsWith(prefix)) {
        const num = parseInt(row.masterAhspKode.replace(prefix, ''), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
  });
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

const createEmptyRow = (type = 'ahsp', sections = []) => ({
  key: Math.random().toString(36).substring(7),
  masterAhspId: null,
  masterAhspKode: '',
  uraian: '',
  uraianCustom: '',
  satuan: '',
  volume: '0',
  hargaSatuan: '0',
  baseSubtotal: '0',
  mode: type, // 'ahsp' or 'lumsum'
  isExpanded: false,
  analisaDetails: [],
  profitPercent: '15'
});

function createEmptySection(name, currentSections = []) {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    namaBab: name || 'Pekerjaan Baru',
    lines: [createEmptyRow('ahsp', currentSections)]
  };
}

function calculateHargaSatuan(baseSubtotal, profitPercent) {
  const base = parseNum(baseSubtotal);
  const profit = parseNum(profitPercent);
  const total = Math.round(base * (1 + (profit / 100)));
  return total;
}

function AsyncCombobox({ value, kode, mode, locationId, onSelect, placeholder }) {
  const [query, setQuery] = useState(kode || value || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setQuery(kode || value || ''); }, [value, kode]);

  const updateCoords = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
    }
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    function handleClickOutside(event) {
      const isInsideWrapper = wrapperRef.current && wrapperRef.current.contains(event.target);
      const isInsideResults = resultsRef.current && resultsRef.current.contains(event.target);
      if (!isInsideWrapper && !isInsideResults) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef, resultsRef]);

  useEffect(() => {
    if (!query || query.length < 1 || !open) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const searchPattern = `%${query.trim().replace(/\s+/g, '%')}%`;
        let combined = [];

        if (mode === 'ahsp') {
          const { data, error } = await supabase
            .from('view_analisa_ahsp')
            .select('*')
            .or(`kode_ahsp.ilike.%${query.trim()}%,nama_pekerjaan.ilike.%${query.trim()}%`)
            .order('kode_ahsp')
            .limit(20);
          
          if (!error) combined = (data || []).map(d => ({ 
            ...d, 
            id: d.id, 
            type: 'ahsp' 
          }));
        } else {
          const { data: lumsum, error } = await supabase.from('view_master_harga_gabungan')
            .select('*')
            .eq('kategori_item', 'Lumpsum')
            .ilike('nama_item', searchPattern)
            .limit(15);
          
          if (!error) {
            combined = (lumsum || []).map(d => ({ 
              id: d.id, 
              kode_ahsp: d.kode_item || 'LS.???', 
              nama_pekerjaan: d.nama_item, 
              satuan_pekerjaan: d.satuan, 
              total_subtotal: d.harga_satuan,
              type: 'lumsum'
            }));
          }
        }

        if (open) {
          setResults(combined);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open, mode]);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input 
        ref={inputRef}
        type="text" 
        value={query} 
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }} 
        onFocus={(e) => { 
          e.target.select();
          if(query.length >= 1) setOpen(true); 
        }} 
        className={`w-full bg-slate-50 dark:bg-slate-900/50 border-none px-2 py-1.5 text-[11px] font-mono font-bold placeholder:font-sans placeholder:font-normal focus:ring-1 focus:ring-indigo-500 rounded transition-all ${kode ? 'text-indigo-600 dark:text-orange-400' : 'text-slate-900 dark:text-white'}`} 
        placeholder={placeholder} 
        title={value || ''}
      />
      {open && mounted && (query.length >= 1) && createPortal(
        <div 
          ref={resultsRef}
          className="fixed z-[9999] mt-1 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 animate-in fade-in zoom-in-95 duration-200"
          style={{ 
            top: coords.top, 
            left: coords.left,
            width: Math.max(coords.width * 2, 400),
            maxHeight: '300px'
          }}
        >
          {loading && <div className="p-3 text-xs text-slate-400 animate-pulse">Mencari...</div>}
          {!loading && results.length === 0 && <div className="p-3 text-[10px] text-slate-400 italic">Data tidak ditemukan.</div>}
          {!loading && results.map((item, idx) => (
            <div 
              key={idx} 
              className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors" 
              onClick={() => { setOpen(false); onSelect(item); }}
              title={item.nama_pekerjaan}
            >
              <div className="flex items-start gap-2.5">
                {item.is_custom && (
                  <span className="mt-1 text-[7px] bg-indigo-600 dark:bg-orange-600 text-white px-1 py-0.5 rounded font-black uppercase tracking-tighter flex-shrink-0">Custom</span>
                )}
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <div className="text-[9px] font-mono font-bold text-indigo-500 dark:text-orange-400 opacity-80">{item.kode_ahsp}</div>
                  <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">{item.nama_pekerjaan}</div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                   <div className="text-[10px] font-mono font-bold text-slate-900 dark:text-white">{formatIdr(parseFloat(item.total_subtotal || 0))}</div>
                   <div className="text-[9px] text-slate-400">{item.satuan_pekerjaan || item.satuan}</div>
                </div>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function RabEditorTab({ 
  projectId, 
  initialIdentity,
  onRefresh,
  onEditIdentity,
  ownerId,
  backupData = [],
  member,
  projectStartDate,
  setProjectStartDate
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [sections, setSections] = useState([]);
  const [recap, setRecap] = useState({ subtotal: 0, ppn: 0, total: 0, rounded: 0, sectionTotals: [] });
  const [isPending, startTransition] = useTransition();
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [identity, setIdentity] = useState({
    name: '', code: '', location: '', location_id: '', fiscal_year: new Date().getFullYear().toString(),
    hsp_value: 0, ppn_percent: 12, program_name: '', activity_name: '', work_name: '',
    start_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (initialIdentity && !projectId) {
      setIdentity(prev => ({
        ...prev,
        ...initialIdentity
      }));
    }
  }, [initialIdentity, projectId]);

  const [isEditingPagu, setIsEditingPagu] = useState(false);
  const [projectMeta, setProjectMeta] = useState({ ppn_percent: 12, hsp_value: 0 });
  const [globalOverhead, setGlobalOverhead] = useState(15);
  const [dbMaxLsNum, setDbMaxLsNum] = useState(0);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    async function fetchLocations() {
      const { data } = await supabase.from('locations').select('*').order('name');
      if (data) setLocations(data);
    }
    fetchLocations();
  }, []);

  const isAdmin = member?.role === 'admin';
  const isPro = member?.role === 'pro';
  const isPrivileged = isAdmin || isPro;

  const backupTotals = useMemo(() => {
    const map = {};
    (backupData || []).forEach(r => {
      if (!map[r.line_id]) map[r.line_id] = 0;
      map[r.line_id] += Number(r.total || 0);
    });
    return map;
  }, [backupData]);

  const fetchMaxLs = useCallback(async () => {
    try {
      const { data } = await supabase.from('master_harga_custom').select('kode_item').ilike('kode_item', 'LS.%');
      let max = 0;
      (data || []).forEach(item => {
        const match = item.kode_item.match(/\.(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) max = num;
        }
      });
      setDbMaxLsNum(max);
    } catch (e) {
      console.error('Error fetching LS max:', e);
    }
  }, []);

  const loadRab = useCallback(async () => {
    if (!projectId) {
      setSections([createEmptySection('PEKERJAAN PERSIAPAN')]);
      if (!initialIdentity) {
        setIdentity({
          name: '', code: '', location: '', fiscal_year: new Date().getFullYear().toString(),
          hsp_value: 0, ppn_percent: 12, program_name: '', activity_name: '', work_name: ''
        });
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
    if (proj) {
      setProjectMeta({ ppn_percent: proj.ppn_percent ?? 12, hsp_value: proj.hsp_value ?? 0 });
      setIdentity({
        name: proj.name || '',
        code: proj.code || '',
        program_name: proj.program_name || '',
        activity_name: proj.activity_name || '',
        work_name: proj.work_name || '',
        location: proj.location || '',
        location_id: proj.location_id || '',
        fiscal_year: proj.fiscal_year || '',
        contract_number: proj.contract_number || '',
        hsp_value: proj.hsp_value || 0,
        ppn_percent: proj.ppn_percent ?? 12,
        start_date: proj.start_date || ''
      });
    }

    const { data, error } = await supabase
      .from('ahsp_lines')
      .select('*, master_ahsp(kode_ahsp)')
      .eq('project_id', projectId)
      .order('sort_order');
    
    if (!error && data) {
      const ahspIds = [...new Set(data.filter(i => i.master_ahsp_id).map(i => i.master_ahsp_id))];
      let masterPrices = {};
      if (ahspIds.length > 0) {
        // PRIORITAS: Ambil detail lengkap & override terbaru untuk perhitungan subtotal di frontend
        const [mastersRes, overridesRes] = await Promise.all([
          supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', ahspIds),
          supabase.from('master_harga_custom').select('kode_item, harga_satuan')
        ]);
        
        const overrideMap = {};
        (overridesRes.data || []).forEach(o => { if (o.harga_satuan > 0) overrideMap[o.kode_item] = o.harga_satuan; });

        (mastersRes.data || []).forEach(m => {
          let calcSubtotal = 0;
          const details = Array.isArray(m.details) ? m.details : [];
          details.forEach(d => {
            const p = overrideMap[d.kode_item] || d.harga_konversi || 0;
            calcSubtotal += (Number(d.koefisien || 0) * Number(p));
          });
          masterPrices[m.master_ahsp_id] = calcSubtotal;
        });
      }

      // --- LOGIKA PROFIT GLOBAL CERDAS ---
      let initGlobalProfit = proj?.overhead_percent ?? proj?.profit_percent;
      if (initGlobalProfit === null || initGlobalProfit === undefined) {
         if (data.length > 0) {
             const first = data[0];
             const bPrice = parseNum(first.master_ahsp_id ? masterPrices[first.master_ahsp_id] : 0);
             if (bPrice > 0 && parseNum(first.harga_satuan) > 0) {
                 initGlobalProfit = Math.round(((parseNum(first.harga_satuan) / bPrice) - 1) * 100);
             }
         }
      }
      const finalGlobalProfit = initGlobalProfit ?? 15;
      setGlobalOverhead(finalGlobalProfit);

      const grouped = {};
      data.forEach(item => {
        const bab = item.bab_pekerjaan || 'UMUM';
        if (!grouped[bab]) grouped[bab] = [];
        
        // 1. Tentukan Harga Dasar Murni
        const freshPrice = item.master_ahsp_id ? masterPrices[item.master_ahsp_id] : null;
        let basePrice = parseNum(freshPrice);
        
        if (basePrice === 0 && item.analisa_custom && item.analisa_custom.length > 0) {
           basePrice = item.analisa_custom.reduce((s, d) => s + (parseNum(d.koefisien) * parseNum(d.harga_satuan_snapshot || d.harga || 0)), 0);
        }

        // 2. Tentukan Profit (Prioritas: DB -> Hitung Mundur -> Global -> Default 15%)
        let savedItemProfit = item.profit_percent !== null && item.profit_percent !== undefined ? parseNum(item.profit_percent) : null;
        let reverseEngineeredProfit = null;
        
        if (basePrice > 0 && parseNum(item.harga_satuan) > 0) {
           reverseEngineeredProfit = Math.round(((parseNum(item.harga_satuan) / basePrice) - 1) * 100);
        }

        let finalProfit = 15; 
        if (savedItemProfit !== null) {
            finalProfit = savedItemProfit;
        } else if (reverseEngineeredProfit !== null) {
            finalProfit = reverseEngineeredProfit;
        } else {
            finalProfit = finalGlobalProfit;
        }

        // 3. Kalkulasi Harga Dasar untuk Lumpsum
        if (basePrice === 0 && parseNum(item.harga_satuan) > 0) {
           basePrice = parseNum(item.harga_satuan) / (1 + (finalProfit / 100));
        }

        // 4. Sinkronisasi Harga Final
        const activePrice = Math.round(basePrice * (1 + (finalProfit / 100)));

        grouped[bab].push({
          key: item.id,
          masterAhspId: item.master_ahsp_id,
          masterAhspKode: item.master_ahsp?.kode_ahsp || (item.uraian === 'LUMSUM' ? 'LUMSUM' : (item.uraian.startsWith('AN.') ? item.uraian : 'LUMSUM')),
          uraian: item.uraian,
          uraianCustom: item.uraian_custom,
          satuan: item.satuan,
          volume: String(item.volume),
          baseSubtotal: String(basePrice),   // HARGA DASAR TERKUNCI
          hargaSatuan: String(activePrice),  // HARGA FINAL (+PROFIT)
          mode: item.master_ahsp_id ? 'ahsp' : 'lumsum',
          analisaDetails: item.analisa_custom || [],
          isExpanded: false,
          profitPercent: String(finalProfit) 
        });
      });

      setSections(
        Object.keys(grouped).length > 0
          ? Object.entries(grouped).map(([bab, lines]) => ({
              id: bab, 
              namaBab: bab,
              lines: lines
            }))
          : [createEmptySection('PEKERJAAN PERSIAPAN')]
      );
    } else {
      setSections([createEmptySection('PEKERJAAN PERSIAPAN')]);
    }
    setLoading(false);
  }, [projectId, initialIdentity]);

  useEffect(() => { 
    loadRab();
    fetchMaxLs();
  }, [loadRab, fetchMaxLs]);

  useEffect(() => {
    startTransition(() => {
      const sectionTotals = sections.map(sec => ({
        name: sec.namaBab,
        total: sec.lines.reduce((s, r) => s + (parseNum(r.volume) * parseNum(r.hargaSatuan)), 0)
      }));
      const subtotal = Math.round(sectionTotals.reduce((sum, s) => sum + s.total, 0));
      const ppnPercent = parseNum(identity.ppn_percent);
      const ppn = Math.round(subtotal * (ppnPercent / 100));
      const total = subtotal + ppn;
      const rounded = Math.ceil(total / 1000) * 1000;
      setRecap({ subtotal, ppn, total, rounded, sectionTotals });
    });
  }, [sections, identity.ppn_percent]);

  const updateRow = (sId, rowKey, patch) => {
    setSections(prev => prev.map(s => s.id === sId ? { 
      ...s, 
      lines: s.lines.map(r => {
        if (r.key === rowKey) {
          const updated = { ...r, ...patch };
          if (updated.analisaDetails && updated.analisaDetails.length > 0) {
            const sum = updated.analisaDetails.reduce((s, d) => s + (parseNum(d.koefisien) * parseNum(d.harga)), 0);
            const hs = calculateHargaSatuan(sum, updated.profitPercent);
            updated.hargaSatuan = String(hs);
            updated.baseSubtotal = String(sum);
          } else if (patch.hargaSatuan !== undefined) {
            // User mengedit Harga Satuan manual.
            // KUNCI: Harga Dasar (baseSubtotal) TIDAK BOLEH BERUBAH.
            // Kita hitung ulang profitPercent agar sinkron.
            const base = parseNum(updated.baseSubtotal);
            const newHarga = parseNum(patch.hargaSatuan);
            if (base > 0) {
              const newProfit = ((newHarga / base) - 1) * 100;
              updated.profitPercent = String(Math.round(newProfit * 100) / 100); // Simpan 2 desimal agar akurat
              updated.hargaSatuan = String(newHarga);
            } else {
              // Jika base masih 0 (lumpsum baru), jadikan harga ini sebagai base
              updated.baseSubtotal = String(newHarga);
              updated.hargaSatuan = String(newHarga);
              updated.profitPercent = "0";
            }
          }
          return updated;
        }
        return r;
      })
    } : s));
  };

  const updateProfitRow = (sId, rowKey, profitVal) => {
    const val = parseNum(profitVal);
    setSections(prev => prev.map(s => {
      if (s.id !== sId) return s;
      return {
        ...s,
        lines: s.lines.map(r => {
          if (r.key !== rowKey) return r;
          // Hanya kalikan Harga Dasar (baseSubtotal) yang sudah dikunci
          const currentBase = parseNum(r.baseSubtotal);
          const newHarga = Math.round(currentBase * (1 + (val / 100)));
          return { ...r, profitPercent: String(val), hargaSatuan: String(newHarga) };
        })
      };
    }));
  };

  const applyGlobalOverheadToAllRows = () => {
    const profitPct = parseNum(globalOverhead);
    setSections(prev => prev.map(s => ({
      ...s,
      lines: s.lines.map(r => {
        // Hanya kalikan Harga Dasar (baseSubtotal) yang sudah dikunci
        const currentBase = parseNum(r.baseSubtotal);
        const newHarga = Math.round(currentBase * (1 + (profitPct / 100)));
        return { ...r, profitPercent: String(profitPct), hargaSatuan: String(newHarga) };
      })
    })));
  };

  const handleAhspSelect = (sId, rowKey, data) => {
    const hs = calculateHargaSatuan(data.total_subtotal, globalOverhead);
    updateRow(sId, rowKey, { 
      masterAhspId: data.ahsp_id || data.id, 
      masterAhspKode: data.kode_ahsp || 'LUMSUM',
      uraian: data.nama_pekerjaan || data.uraian, 
      uraianCustom: data.type === 'lumsum' ? (data.nama_pekerjaan || data.nama_item || data.uraian) : '',
      satuan: data.satuan_pekerjaan || data.satuan, 
      baseSubtotal: String(data.total_subtotal), 
      hargaSatuan: String(hs), 
      profitPercent: String(globalOverhead),
      mode: data.type === 'lumsum' ? 'lumsum' : 'ahsp',
      analisaDetails: [] // WAJIB KOSONGKAN agar tidak menimpa harga baru dengan breakdown lama
    });
  };

  const saveToMasterLumsum = async (row) => {
    if (!row.uraian || !row.hargaSatuan) { 
      setError('Harap isi Nama Pekerjaan & Harga sebelum simpan katalog.'); 
      return; 
    }
    try {
      const { data: existing } = await supabase.from('master_harga_custom').select('kode_item').ilike('kode_item', 'LS.%');
      let max = 0;
      (existing || []).forEach(e => {
        const m = e.kode_item.match(/\.(\d+)$/);
        if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
      });
      const nextCode = `LS.${String(max+1).padStart(3, '0')}`;

      const { error } = await supabase.from('master_harga_custom').insert({
        nama_item: row.uraian,
        satuan: row.satuan,
        harga_satuan: parseNum(row.hargaSatuan),
        kategori_item: 'Lumpsum',
        kode_item: nextCode,
        tkdn_percent: 0
      });

      if (error) throw error;
      alert(`Berhasil disimpan ke Katalog Harga Dasar dengan kode ${nextCode}!`);
    } catch (err) { 
      setError('Gagal simpan katalog: ' + err.message); 
    }
  };

  const savePagu = async () => {
    try {
      await supabase.from('projects').update({ hsp_value: projectMeta.hsp_value }).eq('id', projectId);
      setIdentity(prev => ({ ...prev, hsp_value: projectMeta.hsp_value }));
      setIsEditingPagu(false);
      if (onRefresh) onRefresh();
    } catch (err) { setError('Gagal simpan pagu: ' + err.message); }
  };

  const saveRab = async () => {
    setError(null);
    setSaving(true);
    try {
      const items = [];
      let counter = 0;
      for (const sec of sections) {
        for (const r of sec.lines) {
          if (!r.uraian) throw new Error(`Kolom Pekerjaan pada Bab ${sec.namaBab} wajib diisi!`);
          const lineId = (r.key && r.key.length === 36) ? r.key : null;
          const lineItem = {
            master_ahsp_id: r.master_ahsp_id || r.masterAhspId || null,
            bab_pekerjaan: sec.namaBab,
            sort_order: counter++,
            uraian: r.uraian,
            uraian_custom: r.uraianCustom || null,
            satuan: r.satuan,
            volume: parseNum(r.volume),
            harga_satuan: parseNum(r.hargaSatuan),
            jumlah: parseNum(r.volume) * parseNum(r.hargaSatuan),
            profit_percent: parseNum(r.profitPercent),
            analisa_custom: r.analisaDetails || []
          };
          if (lineId) lineItem.id = lineId;
          items.push(lineItem);
        }
      }

      const projName = identity.name || identity.work_name || identity.activity_name || identity.program_name || "Proyek Tanpa Nama";
      const identityPayload = {
        name: projName,
        program_name: identity.program_name || null,
        activity_name: identity.activity_name || null,
        work_name: identity.work_name || null,
        location: identity.location || null,
        location_id: identity.location_id || null,
        fiscal_year: identity.fiscal_year || null,
        contract_number: identity.contract_number || null,
        hsp_value: parseNum(projectMeta.hsp_value || identity.hsp_value),
        ppn_percent: parseNum(projectMeta.ppn_percent),
        overhead_percent: parseNum(globalOverhead),
        start_date: identity.start_date || new Date().toISOString().split('T')[0]
      };

      if (!projectId && !identity.work_name && !identity.name) {
        throw new Error('Nama Pekerjaan wajib diisi untuk membuat proyek baru.');
      }

      // =========================================================================
      // BYPASS TOTAL: KITA TIDAK LAGI PAKAI RPC 'save_project_transactional'
      // =========================================================================
      let currentProjectId = projectId;

      // 1. Simpan atau Update Data Proyek
      if (currentProjectId) {
        const { error: pErr } = await supabase.from('projects').update(identityPayload).eq('id', currentProjectId);
        if (pErr) throw pErr;
      } else {
        const { data: pData, error: pErr } = await supabase.from('projects').insert(identityPayload).select().single();
        if (pErr) throw pErr;
        currentProjectId = pData.id;
      }

      // 2. Hapus Item yang Dibuang oleh User di UI
      if (currentProjectId) {
        const keptIds = items.map(it => it.id).filter(id => id != null);
        if (keptIds.length > 0) {
          await supabase.from('ahsp_lines').delete().eq('project_id', currentProjectId).not('id', 'in', `(${keptIds.join(',')})`);
        } else {
          await supabase.from('ahsp_lines').delete().eq('project_id', currentProjectId);
        }
      }

      // 3. Simpan / Update Item RAB
      if (items.length > 0) {
        const linesPayload = items.map(it => ({ ...it, project_id: currentProjectId }));
        const { error: lErr } = await supabase.from('ahsp_lines').upsert(linesPayload);
        if (lErr) throw lErr;
      }

      if (onRefresh) onRefresh(currentProjectId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const [forceShowEditor, setForceShowEditor] = useState(false);

  const isRabEmpty = useMemo(() => {
    if (!sections || sections.length === 0) return true;
    const hasAnyContent = sections.some(s => 
      s.lines && s.lines.some(l => 
        (l.uraian && l.uraian.trim().length > 0) || 
        l.masterAhspId || 
        (l.uraianCustom && l.uraianCustom.trim().length > 0)
      )
    );
    return !hasAnyContent;
  }, [sections]);

  useEffect(() => {
    if (!isRabEmpty) setForceShowEditor(false);
  }, [isRabEmpty]);

  if (loading) return <Spinner />;

  return (
    <div className={`space-y-6 ${showMobileDetails ? 'overflow-hidden max-h-screen' : ''}`}>
      
      {/* ── Mobile Sticky Summary Bar ── */}
      {!isRabEmpty && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-500">
          <div className="flex flex-col" onClick={() => setShowMobileDetails(!showMobileDetails)}>
            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 flex items-center gap-1">
               Grand Total <ChevronDown className={`w-2 h-2 transition-transform ${showMobileDetails ? 'rotate-180' : ''}`} />
            </div>
            <div className="text-sm font-mono font-black text-indigo-600 dark:text-orange-500 leading-none">
              {formatIdr(recap.rounded)}
            </div>
          </div>
          <button 
            onClick={saveRab} 
            disabled={saving} 
            className="flex-1 max-w-[160px] h-12 bg-indigo-600 dark:bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 dark:shadow-orange-600/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <Save className="w-4 h-4" />}
            {saving ? 'Simpan...' : 'Simpan'}
          </button>
        </div>
      )}

      {/* ── Mobile Details Bottom Sheet ── */}
      {showMobileDetails && !isRabEmpty && (
        <div className="lg:hidden fixed inset-0 z-[110] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowMobileDetails(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 rounded-t-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-500">
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-6" onClick={() => setShowMobileDetails(false)} />
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Ringkasan Biaya</h3>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-xs font-bold px-1">
                 <span className="text-slate-500">SUBTOTAL</span>
                 <span className="font-mono text-slate-900 dark:text-white uppercase">{formatIdr(recap.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold px-1 border-t border-slate-100 dark:border-slate-800 pt-4">
                 <span className="text-slate-500">PPN ({identity.ppn_percent}%)</span>
                 <span className="font-mono text-slate-900 dark:text-white uppercase">+{formatIdr(recap.ppn)}</span>
              </div>
              <div className="flex justify-between items-center bg-indigo-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-orange-500/20">
                 <span className="text-[10px] font-black text-indigo-600 dark:text-orange-400 uppercase tracking-widest">Grand Total</span>
                 <span className="text-lg font-mono font-black text-indigo-700 dark:text-orange-500">{formatIdr(recap.total)}</span>
              </div>
              <div className={`p-4 rounded-2xl border flex justify-between items-center font-mono text-xs font-bold ${projectMeta.hsp_value >= recap.rounded ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-500 border-red-100'}`}>
                 <span className="text-[10px] font-black opacity-60 uppercase">Selisih Pagu:</span>
                 <span>{formatIdr(projectMeta.hsp_value - recap.rounded)}</span>
              </div>
            </div>

            <button onClick={() => setShowMobileDetails(false)} className="w-full h-14 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest">Tutup</button>
          </div>
        </div>
      )}

      {/* ── Main Layout ── (Added space at bottom for mobile bar) */}
      <div className="pb-24 lg:pb-0">

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-600 animate-in slide-in-from-top duration-300">
             <AlertCircle className="w-5 h-5 flex-shrink-0" />
             <div className="text-xs font-bold uppercase tracking-tight">{error}</div>
            </div>
          )}

          {(!isRabEmpty || forceShowEditor) && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
             <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                   <Settings className="w-4 h-4 text-indigo-600 dark:text-orange-500" />
                   Builder RAB — Mode Advanced
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Muat analisa standar dari Katalog AHSP untuk menyusun anggaran</p>
             </div>
             <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                   <div className="flex items-center gap-2 px-2">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500 dark:text-orange-400" />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Mulai</span>
                      <input 
                        type="date"
                        value={projectStartDate ? projectStartDate.split('T')[0] : ''}
                        onChange={e => setProjectStartDate && setProjectStartDate(e.target.value)}
                        className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                      />
                   </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                   <div className="flex items-center gap-2 px-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Profit Global</span>
                      <div className="flex items-center gap-1">
                         <input 
                           type="number" 
                           value={globalOverhead} 
                           onChange={e => setGlobalOverhead(e.target.value)}
                           className="w-12 h-8 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-center text-xs font-mono font-bold text-indigo-600 dark:text-orange-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500"
                         />
                         <span className="text-[10px] font-bold text-slate-400">%</span>
                      </div>
                   </div>
                   <button 
                     onClick={applyGlobalOverheadToAllRows}
                     className="px-4 py-2 bg-indigo-600 dark:bg-orange-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-700 transition-colors shadow-sm"
                   >
                     Terapkan
                   </button>
                </div>
             </div>
            </div>
          )}

          {(isRabEmpty && !forceShowEditor) ? (
            <div className="flex flex-col items-center justify-center py-40 w-full opacity-40 dark:opacity-20 pointer-events-none select-none animate-in fade-in duration-700">
               <Box className="w-24 h-24 mb-6 text-slate-500 dark:text-slate-400" strokeWidth={1} />
               <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.4em] text-center">
                 BELUM ADA DATA PEKERJAAN
               </h3>
            </div>
          ) : (
            <>
              {sections.map((sec, sIdx) => (
                <div key={sec.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 last:mb-0 overflow-hidden">
                   {/* ... (existing section render code) ... */}
                   {/* I'll use the original code here */}
                   <div className="bg-indigo-50/50 dark:bg-orange-900/20 px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 w-full">
                        <span className="text-xs font-bold font-mono w-6 text-center text-indigo-600 dark:text-orange-400">{toRoman(sIdx + 1)}.</span>
                        <input 
                          value={sec.namaBab} 
                          onChange={e => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, namaBab: e.target.value.toUpperCase() } : s))} 
                          onFocus={(e) => e.target.select()}
                          className="bg-transparent font-bold text-xs uppercase tracking-wider focus:outline-none w-full placeholder:text-slate-400 text-slate-900 dark:text-white" 
                          placeholder="NAMA BAB PEKERJAAN..." 
                        />
                      </div>
                      <button onClick={() => setSections(prev => prev.filter(s => s.id !== sec.id))} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                   </div>
                   
                   <div className="bg-white dark:bg-slate-900 overflow-x-auto px-2 pb-4">
                      <table className="w-full border-separate border-spacing-0 min-w-[800px]">
                         <thead>
                            <tr className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                              <th className="px-2 py-3 text-left w-8">NO</th>
                              <th className="px-3 py-3 text-left w-52">CARI ANALISA</th>
                              <th className="px-3 py-3 text-left">URAIAN</th>
                              <th className="px-1 py-3 text-center w-12">SAT</th>
                              <th className="px-3 py-3 text-center w-24">PROFIT</th>
                              <th className="px-3 py-3 text-right w-22">VOL</th>
                              <th className="px-3 py-3 text-right w-44">HARGA</th>
                              <th className="px-3 py-3 text-right w-48">TOTAL</th>
                              <th className="px-1 py-3 w-8"></th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sec.lines.map((row, rIdx) => (
                              <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                                <td className="px-2 py-4 text-slate-400 font-mono text-[10px] w-8">{rIdx + 1}</td>
                                <td className="px-3 py-4 relative group/code w-52">
                                   <AsyncCombobox 
                                     value={row.uraian} 
                                     kode={row.masterAhspKode} 
                                     mode={row.mode}
                                     locationId={identity.location_id || member?.selected_location_id}
                                     onSelect={data => handleAhspSelect(sec.id, row.key, data)} 
                                     placeholder={row.mode === 'lumsum' ? "CARI..." : "CARI..."} 
                                   />
                                </td>
                                <td className="px-3 py-4 min-w-[150px]">
                                   <input 
                                     value={row.uraianCustom || row.uraian || ''} 
                                     onChange={e => updateRow(sec.id, row.key, { uraianCustom: e.target.value })} 
                                     onFocus={(e) => e.target.select()}
                                     className="w-full bg-transparent border-none px-0 py-0 text-xs text-slate-700 dark:text-slate-300 font-medium focus:ring-0 placeholder:text-slate-400/50" 
                                     placeholder={row.mode === 'lumsum' ? "Nama Item..." : "Deskripsi pekerjaan..."} 
                                   />
                                </td>
                                <td className="px-1 py-4 text-center w-12">
                                   <span className="text-[10px] font-bold text-slate-500 uppercase">{row.satuan || '-'}</span>
                                </td>
                                <td className="px-2 py-4 text-center w-24">
                                   <div className="flex items-center justify-center gap-1">
                                     <input 
                                       type="number" 
                                       value={row.profitPercent ?? ''} 
                                       onFocus={e => e.target.select()}
                                       onChange={e => updateProfitRow(sec.id, row.key, e.target.value)}
                                       className="w-12 h-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-indigo-500"
                                     />
                                     <span className="text-[9px] text-slate-400 font-bold">%</span>
                                   </div>
                                </td>
                                <td className="px-3 py-4 w-22 text-right">
                                  <div className="flex flex-col items-center gap-1.5 relative group/vol">
                                    <input 
                                      type="number" 
                                      value={row.volume ?? ''} 
                                      onFocus={e => e.target.select()} 
                                      onChange={e => updateRow(sec.id, row.key, { volume: e.target.value })} 
                                      className={`w-16 bg-white dark:bg-slate-900 border ${backupTotals[row.id || row.key] ? 'border-amber-200 dark:border-amber-900/40 ring-2 ring-amber-500/5' : 'border-slate-200 dark:border-slate-700'} px-2 py-1 text-right font-mono font-bold text-[11px] text-indigo-600 dark:text-orange-400 rounded focus:ring-1 focus:ring-indigo-500 transition-all`} 
                                      placeholder="0" 
                                    />
                                    {isPrivileged && backupTotals[row.id || row.key] !== undefined && (
                                      <button 
                                        onClick={() => updateRow(sec.id, row.key, { volume: String(backupTotals[row.id || row.key]) })}
                                        className="absolute -left-6 top-1/2 -translate-y-1/2 p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-lg opacity-0 group-hover/vol:opacity-100 transition-all hover:scale-110 active:scale-90"
                                        title={`Terapkan Volume dari Backup Data: ${backupTotals[row.id || row.key].toLocaleString('id-ID')} ${row.satuan}`}
                                      >
                                        <Calculator className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-4 w-44">
                                   {row.mode === 'lumsum' || !row.masterAhspId ? (
                                     <div className="flex flex-col gap-1">
                                       <input 
                                         type="number" 
                                         value={row.hargaSatuan ?? ''} 
                                         onFocus={e => e.target.select()} 
                                         onChange={e => updateRow(sec.id, row.key, { hargaSatuan: e.target.value })} 
                                         className="w-full bg-white dark:bg-slate-900 border border-indigo-100 dark:border-orange-900/40 px-2 py-1 text-right font-mono font-bold text-indigo-700 dark:text-orange-500 rounded" 
                                       />
                                       {row.mode === 'lumsum' && <button onClick={() => saveToMasterLumsum(row)} className="text-[8px] font-bold text-indigo-400 hover:text-indigo-600 uppercase self-end transition-colors">Simpan Katalog</button>}
                                     </div>
                                   ) : (
                                     <div className="text-right font-mono text-slate-800 dark:text-slate-200 font-bold text-[11px]">{formatIdr(parseNum(row.hargaSatuan))}</div>
                                   )}
                                </td>
                                <td className="px-3 py-4 text-right font-mono font-bold text-slate-900 dark:text-white text-[11px] w-48">
                                   {formatIdr(parseNum(row.volume) * parseNum(row.hargaSatuan))}
                                </td>
                                <td className="px-1 py-4 text-center w-8">
                                  <button onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, lines: s.lines.filter(r => r.key !== row.key) } : s))} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                         <tfoot className="bg-slate-50/30 dark:bg-slate-900/10 border-t border-slate-100 dark:border-slate-800">
                            <tr>
                              <td colSpan={9} className="px-6 py-4">
                                  <div className="flex gap-4">
                                    <button onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, lines: [...s.lines, { ...createEmptyRow('ahsp', prev), masterAhspKode: '' }] } : s))} className="text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50 uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">+ Item Analisa</button>
                                    <button onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, lines: [...s.lines, { ...createEmptyRow('lumsum', prev), masterAhspKode: generateNextCode('lumsum', prev, dbMaxLsNum) }] } : s))} className="text-[9px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900/50 uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all">+ Item Lumpsum</button>
                                  </div>
                              </td>
                            </tr>
                         </tfoot>
                      </table>
                   </div>
                </div>
              ))}

              <div className="flex justify-center pt-4">
                 <button 
                   onClick={() => setSections(prev => [...prev, createEmptySection('', prev)])} 
                   className="group flex items-center gap-3 px-8 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-orange-500 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-600 dark:hover:border-orange-500 transition-all shadow-sm"
                 >
                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">+ Tambah Bab Pekerjaan Baru</span>
                 </button>
              </div>
            </>
          )}
        </div>
        
        {/* Right Sidebar */}
        <div className="lg:sticky lg:top-[120px] space-y-4">
           {(!isRabEmpty || forceShowEditor) && (
             <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 animate-in fade-in duration-700">
                {/* ... (recap content) ... */}
                <div className="bg-slate-700 dark:bg-slate-950 pt-6 pb-5 px-6 text-white text-center">
                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Harga Kontrak</div>
                   <div className="text-2xl font-mono font-black text-indigo-400 dark:text-orange-400 tracking-tighter drop-shadow-[0_0_10px_rgba(129,140,248,0.2)] dark:drop-shadow-[0_0_10px_rgba(249,115,22,0.2)]">
                     {formatIdr(recap.rounded)}
                   </div>
                </div>
                
                <div className="p-5 pt-4 space-y-4">
                   <div className="space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">
                         <span>Subtotal RAB</span>
                         <span className="font-mono text-slate-900 dark:text-slate-100">{formatIdr(recap.subtotal)}</span>
                      </div>
                      {recap.sectionTotals.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 space-y-2 border border-slate-100 dark:border-slate-800">
                           {recap.sectionTotals.map((s, i) => (
                             <div key={i} className="flex justify-between items-start gap-3 text-[10px]">
                                <span className="text-slate-500 dark:text-slate-400 font-medium leading-tight flex-1">{toRoman(i+1)}. {s.name}</span>
                                <span className="font-mono text-slate-900 dark:text-slate-200">{formatIdr(s.total)}</span>
                             </div>
                           ))}
                        </div>
                      )}
                   </div>

                   <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">PPN</span>
                         <div className="flex items-center gap-1.5">
                            <input 
                              type="number" 
                              onFocus={(e) => e.target.select()} 
                              value={identity.ppn_percent} 
                              onChange={e => {
                                const val = parseNum(e.target.value);
                                setProjectMeta(prev => ({ ...prev, ppn_percent: val }));
                                setIdentity(prev => ({ ...prev, ppn_percent: val }));
                              }} 
                              className="w-10 bg-slate-100 dark:bg-slate-900 border-none px-1 py-1 text-xs font-mono font-bold text-center text-slate-700 dark:text-white rounded focus:ring-1" 
                            />
                            <span className="text-[10px] font-bold text-slate-400">%</span>
                         </div>
                      </div>
                      <div className="text-right text-[11px] font-mono font-bold text-slate-400 italic">+{formatIdr(recap.ppn)}</div>
                   </div>

                   <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                      <div className="flex justify-between items-center bg-indigo-50/50 dark:bg-orange-900/20 p-2 rounded-lg">
                         <span className="text-[10px] font-bold text-slate-600 dark:text-orange-400 uppercase">Grand Total</span>
                         <span className="text-sm font-mono font-black text-indigo-700 dark:text-orange-500">{formatIdr(recap.total)}</span>
                      </div>
                   </div>
                </div>

                <div className="p-5 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                   <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pagu Anggaran</span>
                      <button onClick={() => setIsEditingPagu(!isEditingPagu)} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"><Edit3 className="w-3 h-3" /></button>
                   </div>
                   {isEditingPagu ? (
                      <div className="flex gap-2">
                         <input 
                           autoFocus 
                           type="number" 
                           onFocus={(e) => e.target.select()} 
                           value={projectMeta.hsp_value} 
                           onChange={e => {
                             const val = parseNum(e.target.value);
                             setProjectMeta(prev => ({ ...prev, hsp_value: val }));
                             setIdentity(prev => ({ ...prev, hsp_value: val }));
                           }} 
                           className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 text-xs font-mono p-2 rounded-lg focus:ring-1 text-slate-900 dark:text-white" 
                         />
                         <button onClick={savePagu} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm">Simpan</button>
                      </div>
                   ) : (
                      <div className={`text-xs font-mono font-bold px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border flex justify-between items-center ${projectMeta.hsp_value >= recap.rounded ? 'text-emerald-600 border-emerald-100 dark:border-emerald-900/30' : 'text-red-500 border-red-100 dark:border-red-900/30'}`}>
                         <span>Selisih:</span>
                         <span>{formatIdr(projectMeta.hsp_value - recap.rounded)}</span>
                      </div>
                   )}
                </div>

                <div className="p-5">
                    <button onClick={saveRab} disabled={saving} className="w-full py-3.5 bg-indigo-600 dark:bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-indigo-600/20 dark:shadow-orange-600/10 hover:translate-y-[-1px] transition-all flex items-center justify-center gap-2">
                       <Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan RAB'}
                    </button>
                 </div>
             </div>
           )}

            {(!isRabEmpty || forceShowEditor) && (
              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600"><Info className="w-5 h-5" /></div>
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-tight">Gunakan item &quot;Lumpsum&quot; untuk pekerjaan manual yang tidak ada di katalog.</div>
              </div>
            )}
        </div>
      </div>
    </div>
  </div>
  );
}
