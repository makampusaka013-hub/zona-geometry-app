'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import Spinner from '../Spinner';
import { ClipboardList, Save, CheckCircle2, ShieldAlert, XCircle, RotateCcw, ChevronDown, Plus, Trash2, AlertCircle, Edit3, Trash, LayoutGrid, Package, Info, Settings, Calculator, Check, MapPin, Calendar, Box } from 'lucide-react';
import LocationSelect from '@/components/LocationSelect';
import useProjectStore from '@/store/useProjectStore';
import useRabStore from '@/store/useRabStore';
import useUIStore from '@/store/useUIStore';
import { searchAhspCatalog, searchLumpsumItems, getMaxLumpsumSuffix } from '@/lib/services/rabService';
import { toast } from '@/lib/toast';

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

const createEmptyRow = (type = 'ahsp', sections = [], defaultProfit = '15') => ({
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
  profitPercent: String(defaultProfit)
});

function createEmptySection(name, currentSections = [], defaultProfit = '15') {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    namaBab: name || 'Pekerjaan Baru',
    lines: [createEmptyRow('ahsp', currentSections, defaultProfit)]
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
        let combined = [];

        if (mode === 'ahsp') {
          const { data, error } = await searchAhspCatalog(query);
          if (!error) combined = (data || []).map(d => ({
            ...d,
            id: d.id,
            type: 'ahsp'
          }));
        } else {
          const { data, error } = await searchLumpsumItems(query);
          if (!error) {
            combined = (data || []).map(d => ({
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
        className={`w-full bg-slate-50 dark:bg-slate-900 bg-opacity-50 border-none px-2 py-1.5 text-[11px] font-mono font-bold placeholder:font-sans placeholder:font-normal focus:ring-1 focus:ring-indigo-500 rounded transition-all ${kode ? 'text-indigo-600 dark:text-orange-400' : 'text-slate-900 dark:text-white'}`}
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

function RabSectionTable({
  sec, sIdx, identity, member, backupTotals, isPrivileged,
  updateRow, updateProfitRow, handleAhspSelect, saveToMasterLumsum,
  setSections, dbMaxLsNum, generateNextCode, globalOverhead,
  createEmptyRow, formatIdr, parseNum, toRoman, calculateHargaSatuan
}) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: sec.lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
      <div
        ref={parentRef}
        className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 pb-4"
      >
        <table className="w-full border-separate border-spacing-0 relative table-fixed">
          <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 shadow-sm">
            <tr className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-tighter border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 bg-opacity-95 backdrop-blur-sm">
              <th className="px-1 py-2 text-left w-[2%]">#</th>
              <th className="px-1 py-2 text-left w-[14%]">ANALISA</th>
              <th className="px-1 py-2 text-left w-[38%]">URAIAN PEKERJAAN</th>
              <th className="px-1 py-2 text-center w-[4%]">SAT</th>
              <th className="px-1 py-2 text-center w-[7%]">PROFIT</th>
              <th className="px-1 py-2 text-right w-[8%]">VOL</th>
              <th className="px-1 py-2 text-right w-[12%]">HARGA</th>
              <th className="px-1 py-2 text-right w-[13%]">TOTAL</th>
              <th className="px-1 py-2 w-[2%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Top Spacer */}
            {virtualItems.length > 0 && virtualItems[0].start > 0 && (
              <tr>
                <td colSpan={9} style={{ height: `${virtualItems[0].start}px` }} />
              </tr>
            )}

            {virtualItems.map((virtualRow) => {
              const row = sec.lines[virtualRow.index];
              const rIdx = virtualRow.index;
              return (
                <tr
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700 bg-opacity-30 transition-colors group h-[64px]"
                >
                  <td className="px-1 py-2 text-slate-400 font-mono text-[9px] truncate">
                    {rIdx + 1}
                  </td>
                  <td className="px-1 py-2 relative group-code">
                    <AsyncCombobox
                      value={row.uraian}
                      kode={row.masterAhspKode}
                      mode={row.mode}
                      locationId={identity.location_id || member?.selected_location_id}
                      onSelect={data => handleAhspSelect(sec.id, row.key, data)}
                      placeholder="CARI..."
                    />
                  </td>
                  <td className="px-1 py-2">
                    <input
                      value={row.uraianCustom || row.uraian || ''}
                      onChange={e => updateRow(sec.id, row.key, { uraianCustom: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-transparent border-none px-0 py-0 text-[10px] text-slate-700 dark:text-slate-300 font-bold focus:ring-0 placeholder:text-slate-400 truncate"
                      placeholder={row.mode === 'lumsum' ? "Nama..." : "Deskripsi..."}
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <span className="text-[9px] font-black text-slate-500 uppercase">{row.satuan || '-'}</span>
                  </td>
                  <td className="px-1 py-2 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <input
                        type="number"
                        value={row.profitPercent ?? ''}
                        onFocus={e => e.target.select()}
                        onChange={e => updateProfitRow(sec.id, row.key, e.target.value)}
                        className="w-8 h-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center text-[9px] font-black text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-[8px] text-slate-400 font-bold">%</span>
                    </div>
                  </td>
                  <td className="px-1 py-2 text-right">
                    <div className="flex flex-col items-end gap-1 relative group-vol">
                      <input
                        type="number"
                        value={row.volume ?? ''}
                        onFocus={e => e.target.select()}
                        onChange={e => updateRow(sec.id, row.key, { volume: e.target.value })}
                        className={`w-12 bg-white dark:bg-slate-900 border ${backupTotals[row.id || row.key] ? 'border-amber-200 dark:border-amber-900 border-opacity-40 ring-2 ring-amber-500 ring-opacity-5' : 'border-slate-200 dark:border-slate-700'} px-1 py-0.5 text-right font-mono font-black text-[9px] text-indigo-600 dark:text-orange-400 rounded focus:ring-1 focus:ring-indigo-500 transition-all`}
                        placeholder="0"
                      />
                      {isPrivileged && backupTotals[row.id || row.key] !== undefined && (
                        <button
                          onClick={() => updateRow(sec.id, row.key, { volume: String(backupTotals[row.id || row.key]) })}
                          className="absolute -left-4 top-1/2 -translate-y-1/2 p-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded shadow-lg opacity-0 group-hover-vol:opacity-100 transition-all scale-75"
                          title={`Val: ${backupTotals[row.id || row.key]}`}
                        >
                          <Calculator className="w-2 h-2" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-2">
                    {row.mode === 'lumsum' || !row.masterAhspId ? (
                      <div className="flex flex-col gap-1">
                        <input
                          type="number"
                          value={row.hargaSatuan ?? ''}
                          onFocus={e => e.target.select()}
                          onChange={e => updateRow(sec.id, row.key, { hargaSatuan: e.target.value })}
                          className="w-full bg-white dark:bg-slate-900 border border-indigo-100 dark:border-orange-900 border-opacity-40 px-1 py-0.5 text-right font-mono font-black text-indigo-700 dark:text-orange-500 rounded text-[9px]"
                        />
                      </div>
                    ) : (
                      <div className="text-right font-mono text-slate-800 dark:text-slate-200 font-black text-[9px] truncate">{formatIdr(parseNum(row.hargaSatuan))}</div>
                    )}
                  </td>
                  <td className="px-1 py-2 text-right font-mono font-black text-slate-900 dark:text-white text-[10px] truncate">
                    {formatIdr(parseNum(row.volume) * parseNum(row.hargaSatuan))}
                  </td>
                  <td className="px-0.5 py-2 text-center">
                    <button onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, lines: s.lines.filter(r => r.key !== row.key) } : s))} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Bottom Spacer */}
            {virtualItems.length > 0 && (totalSize - virtualItems[virtualItems.length - 1].end) > 0 && (
              <tr>
                <td colSpan={9} style={{ height: `${totalSize - virtualItems[virtualItems.length - 1].end}px` }} />
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 bg-opacity-30 dark:bg-slate-900 bg-opacity-10 border-t border-slate-100 dark:border-slate-800 sticky bottom-0 z-10 backdrop-blur-sm">
            <tr>
              <td colSpan={9} className="px-6 py-4">
                <div className="flex gap-4">
                  <button onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, lines: [...s.lines, { ...createEmptyRow('ahsp', prev, globalOverhead), masterAhspKode: '' }] } : s))} className="text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900 bg-opacity-20 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900 bg-opacity-50 uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">+ Item Analisa</button>
                  <button onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, lines: [...s.lines, { ...createEmptyRow('lumsum', prev, globalOverhead), masterAhspKode: generateNextCode('lumsum', prev, dbMaxLsNum) }] } : s))} className="text-[9px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900 bg-opacity-20 px-3 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900 bg-opacity-50 uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all">+ Item Lumpsum</button>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
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
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [conflictData, setConflictData] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [identity, setIdentity] = useState({
    name: '', code: '', location: '', location_id: '', fiscal_year: new Date().getFullYear().toString(),
    hsp_value: 0, ppn_percent: 12, program_name: '', activity_name: '', work_name: '',
    start_date: new Date().toISOString().split('T')[0]
  });

  const lastSavedSnapshot = useRef(null);

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
      const { max } = await getMaxLumpsumSuffix();
      setDbMaxLsNum(max);
    } catch (e) {
      console.error('Error fetching LS max:', e);
    }
  }, []);

  const loadRab = useCallback(async () => {
    if (!projectId) {
      setSections([createEmptySection('PEKERJAAN PERSIAPAN', [], globalOverhead)]);
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
    
    const { project: proj, lines, masterPrices, error } = await useRabStore.getState().loadRabData(projectId);
    
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

    if (!error && lines) {
      const data = lines;
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

        // 2. Tentukan Profit (Prioritas: DB -> Hitung Mundur (untuk data lama) -> Global -> Default 15%)
        let finalProfit = 15;
        const dbProfit = item.profit_percent;

        if (dbProfit !== null && dbProfit !== undefined) {
          finalProfit = parseNum(dbProfit);
        } else {
          if (basePrice > 0 && parseNum(item.harga_satuan) > 0) {
            finalProfit = Math.round(((parseNum(item.harga_satuan) / basePrice) - 1) * 100);
          } else {
            finalProfit = finalGlobalProfit;
          }
        }

        // 3. Kalkulasi Harga Dasar untuk Lumpsum (Reconstruction)
        if (basePrice === 0 && parseNum(item.harga_satuan) > 0) {
           basePrice = parseNum(item.harga_satuan) / (1 + (finalProfit / 100));
        }

        const activePrice = Math.round(basePrice * (1 + (finalProfit / 100)));

        grouped[bab].push({
          key: item.id,
          masterAhspId: item.master_ahsp_id,
          masterAhspKode: item.master_ahsp?.kode_ahsp || (item.uraian === 'LUMSUM' ? 'LUMSUM' : (item.uraian.startsWith('AN.') ? item.uraian : 'LUMSUM')),
          uraian: item.uraian,
          uraianCustom: item.uraian_custom,
          satuan: item.satuan,
          volume: String(item.volume),
          baseSubtotal: String(basePrice),
          hargaSatuan: String(activePrice),
          mode: item.master_ahsp_id ? 'ahsp' : 'lumsum',
          analisaDetails: item.analisa_custom || [],
          isExpanded: false,
          profitPercent: String(finalProfit),
          pekerja_input: item.pekerja_input,
          durasi_input: item.durasi_input,
          start_date: item.start_date
        });
      });

      setSections(
        Object.keys(grouped).length > 0
          ? Object.entries(grouped).map(([bab, lines]) => ({
              id: bab,
              namaBab: bab,
              lines: lines
            }))
          : [createEmptySection('PEKERJAAN PERSIAPAN', [], finalGlobalProfit)]
      );

      const initialSnapshot = {
        identity: { ...proj },
        sections: Object.entries(grouped).map(([bab, lines]) => ({
          namaBab: bab,
          lines: lines.map(l => ({ ...l }))
        }))
      };
      lastSavedSnapshot.current = JSON.stringify(initialSnapshot);
    } else {
      const defaultSections = [createEmptySection('PEKERJAAN PERSIAPAN', [], globalOverhead)];
      setSections(defaultSections);
      lastSavedSnapshot.current = JSON.stringify({
        identity: {},
        sections: defaultSections
      });
    }
    setLoading(false);
  }, [projectId, initialIdentity]);

  // Persistent Draft Logic
  useEffect(() => {
    if (!projectId || loading) return;
    const draftKey = `rab_draft_${projectId}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only load if current sections are empty or default
        if (sections.length === 0 || (sections.length === 1 && sections[0].lines.length <= 1 && !sections[0].lines[0].uraian)) {
           setSections(parsed);
        }
      } catch (e) {
        console.error('Failed to parse draft:', e);
      }
    }
  }, [projectId, loading]);

  useEffect(() => {
    if (!projectId || sections.length === 0 || loading) return;
    const draftKey = `rab_draft_${projectId}`;
    localStorage.setItem(draftKey, JSON.stringify(sections));
  }, [sections, projectId, loading]);

  // Mechanism: Debounced Auto-Save
  useEffect(() => {
    // Only auto-save if project exists and not currently loading or manual saving
    if (!projectId || loading || saving) return;

    const timer = setTimeout(() => {
      // Only auto-save if not already auto-saving
      if (autoSaveStatus === 'saving') return;

      const performAutoSave = async () => {
        setAutoSaveStatus('saving');
        try {
          await saveRab(true); // Call saveRab with silent=true
          setAutoSaveStatus('saved');
          setLastSaved(new Date());
          // Return to idle after 3 seconds
          setTimeout(() => setAutoSaveStatus('idle'), 3000);
        } catch (err) {
          console.error('Auto-save failed:', err);
          setAutoSaveStatus('error');
        }
      };

      performAutoSave();
    }, 5000); // 5 seconds debounce

    return () => clearTimeout(timer);
  }, [sections, identity, projectMeta, globalOverhead]);

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
            const base = parseNum(updated.baseSubtotal);
            const newHarga = parseNum(patch.hargaSatuan);
            if (base > 0) {
              const newProfit = ((newHarga / base) - 1) * 100;
              updated.profitPercent = String(Math.round(newProfit * 100) / 100);
              updated.hargaSatuan = String(newHarga);
            } else {
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
      analisaDetails: []
    });
  };

  const saveToMasterLumsum = async (row) => {
    if (!row.uraian || !row.hargaSatuan) {
      setError('Harap isi Nama Pekerjaan & Harga sebelum simpan katalog.');
      return;
    }
    const { nextCode, error } = await useRabStore.getState().saveLumpsumToMaster({
      uraian: row.uraian,
      satuan: row.satuan,
      hargaSatuan: parseNum(row.hargaSatuan)
    });

    if (error) {
      setError('Gagal simpan katalog: ' + error.message);
    } else {
      alert(`Berhasil disimpan ke Katalog Harga Dasar dengan kode ${nextCode}!`);
    }
  };

  const savePagu = async () => {
    const { error } = await useProjectStore.getState().saveProjectIdentity(projectId, { 
      hsp_value: projectMeta.hsp_value 
    });
    if (error) {
      setError('Gagal simpan pagu: ' + error.message);
    } else {
      setIdentity(prev => ({ ...prev, hsp_value: projectMeta.hsp_value }));
      setIsEditingPagu(false);
      if (onRefresh) onRefresh();
    }
  };

  const saveRab = async (silent = false) => {
    if (!silent) {
      setError(null);
      setSaving(true);
    }

    try {
      const allLines = [];
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
            analisa_custom: r.analisaDetails || [],
            pekerja_input: r.pekerja_input || null,
            durasi_input: r.durasi_input || null,
            start_date: r.start_date || null
          };
          if (lineId) lineItem.id = lineId;
          allLines.push(lineItem);
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

      let linesToUpsert = allLines;
      let identityToSave = identityPayload;
      let shouldDelete = !silent;

      if (silent && lastSavedSnapshot.current) {
        const snapshot = JSON.parse(lastSavedSnapshot.current);
        const isIdentityDirty = JSON.stringify(identityPayload) !== JSON.stringify(snapshot.identity);
        identityToSave = isIdentityDirty ? identityPayload : null;

        const lastLinesMap = new Map();
        (snapshot.sections || []).forEach(s => {
          s.lines.forEach(l => {
            const flatLine = { ...l, bab_pekerjaan: s.namaBab };
            lastLinesMap.set(l.id || l.key, flatLine);
          });
        });

        linesToUpsert = allLines.filter(line => {
          const snapshotLine = lastLinesMap.get(line.id || line.key);
          if (!snapshotLine) return true;
          const currentCompare = {
            uraian: line.uraian, volume: line.volume, harga_satuan: line.harga_satuan,
            profit_percent: line.profit_percent, bab_pekerjaan: line.bab_pekerjaan,
            sort_order: line.sort_order, analisa_custom: line.analisa_custom
          };
          const snapshotCompare = {
            uraian: snapshotLine.uraian, volume: parseNum(snapshotLine.volume),
            harga_satuan: parseNum(snapshotLine.hargaSatuan), profit_percent: parseNum(snapshotLine.profitPercent),
            bab_pekerjaan: snapshotLine.bab_pekerjaan, sort_order: snapshotLine.sort_order,
            analisa_custom: snapshotLine.analisaDetails || []
          };
          return JSON.stringify(currentCompare) !== JSON.stringify(snapshotCompare);
        });

        if (!identityToSave && linesToUpsert.length === 0) return;
      }

      const { projectId: currentProjectId, error: saveErr } = await useRabStore.getState().saveRabData(projectId, identityToSave, linesToUpsert, shouldDelete);
      
      if (saveErr) throw saveErr;

      const newSnapshot = {
        identity: identityPayload,
        sections: sections.map(s => ({
          namaBab: s.namaBab,
          lines: s.lines.map(l => ({ ...l }))
        }))
      };
      lastSavedSnapshot.current = JSON.stringify(newSnapshot);
      localStorage.removeItem(`rab_draft_${projectId}`);

      if (onRefresh && !silent) onRefresh(currentProjectId);
    } catch (err) {
      console.error('Save Error:', err);
      // Conflict Detection (Optimistic Concurrency)
      if (err.code === 'PGRST116' || (err.message && err.message.includes('Konflik'))) {
        setConflictData({
          message: 'Data telah diupdate oleh user lain saat Anda sedang mengedit.',
          details: err.message
        });
      }
      if (!silent) setError(err.message);
      else throw err;
    } finally {
      if (!silent) setSaving(false);
    }
  };


  if (loading) return <Spinner />;

  return (
    <div className={`space-y-6 ${showMobileDetails ? 'overflow-hidden max-h-screen' : ''}`}>
      
      {/* ── Conflict Resolution Modal ── */}
      {conflictData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 p-8 flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-rose-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Konflik Data Terdeteksi</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-bold leading-relaxed">{conflictData.message}</p>
              <p className="text-[10px] text-slate-400 mt-4 italic">Versi di database lebih baru daripada versi yang Anda edit. Pilih langkah untuk melanjutkan:</p>
            </div>
            <div className="grid grid-cols-1 w-full gap-3">
              <button 
                onClick={() => { setConflictData(null); loadRab(); }}
                className="flex items-center justify-center gap-3 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-95"
              >
                <RotateCcw className="w-4 h-4" /> Timpa Draft Saya (Gunakan Data Terbaru)
              </button>
              <button 
                onClick={() => setConflictData(null)}
                className="flex items-center justify-center gap-3 px-6 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
              >
                Tutup & Simpan Manual Nanti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Sticky Summary Bar ── */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white bg-opacity-80 dark:bg-slate-900 dark:bg-opacity-90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-500">
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
            className="flex-1 max-w-[160px] h-12 bg-indigo-600 dark:bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm hover:shadow-[0_10px_20px_rgba(79,70,229,0.3)] dark:hover:shadow-[0_10px_20px_rgba(249,115,22,0.3)] active:scale-95 transition-all duration-300 disabled:opacity-50"
          >
            {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-opacity-20 border-t-white" /> : <Save className="w-4 h-4" />}
            {saving ? 'Simpan...' : 'Simpan'}
          </button>
        </div>

      {/* ── Mobile Details Bottom Sheet ── */}
      {showMobileDetails && (
        <div className="lg:hidden fixed inset-0 z-[110] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900 border-opacity-40 backdrop-blur-sm" onClick={() => setShowMobileDetails(false)} />
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
              <div className="flex justify-between items-center bg-indigo-50 dark:bg-orange-900 bg-opacity-20 p-4 rounded-2xl border border-indigo-100 dark:border-orange-500 bg-opacity-20">
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <div className="lg:col-span-3 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-600 animate-in slide-in-from-top duration-300">
             <AlertCircle className="w-5 h-5 flex-shrink-0" />
             <div className="text-xs font-bold uppercase tracking-tight">{error}</div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900 dark:bg-opacity-30 rounded-2xl flex items-center justify-center text-indigo-600">
                   <Settings className="w-6 h-6" />
                </div>
                <div>
                   <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      Builder RAB — Mode Advanced
                      {autoSaveStatus !== 'idle' && (
                         <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700 ml-2">
                            <div className={`w-1 h-1 rounded-full ${autoSaveStatus === 'saving' ? 'bg-amber-500 animate-pulse' : autoSaveStatus === 'saved' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">
                               {autoSaveStatus === 'saving' ? 'Saving...' : autoSaveStatus === 'saved' ? 'Synced' : 'Error'}
                            </span>
                         </div>
                      )}
                   </h3>

                </div>
             </div>
             <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 bg-opacity-50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
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

                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 bg-opacity-50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
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

                           {sections.map((sec, sIdx) => (
                 <div key={sec.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 last:mb-0 overflow-hidden">
                    <div className="bg-indigo-50 bg-opacity-50 dark:bg-orange-900 dark:bg-opacity-20 px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
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

                    <RabSectionTable
                       sec={sec}
                       sIdx={sIdx}
                       identity={identity}
                       member={member}
                       backupTotals={backupTotals}
                       isPrivileged={isPrivileged}
                       updateRow={updateRow}
                       updateProfitRow={updateProfitRow}
                       handleAhspSelect={handleAhspSelect}
                       saveToMasterLumsum={saveToMasterLumsum}
                       setSections={setSections}
                       dbMaxLsNum={dbMaxLsNum}
                       generateNextCode={generateNextCode}
                       globalOverhead={globalOverhead}
                       createEmptyRow={createEmptyRow}
                       formatIdr={formatIdr}
                       parseNum={parseNum}
                       toRoman={toRoman}
                       calculateHargaSatuan={calculateHargaSatuan}
                    />
                 </div>
               ))}

              <div className="flex justify-center pt-4">
                 <button
                   onClick={() => setSections(prev => [...prev, createEmptySection('', prev, globalOverhead)])}
                   className="group flex items-center gap-3 px-8 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-orange-500 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-600 dark:hover:border-orange-500 transition-all shadow-sm"
                 >
                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">+ Tambah Bab Pekerjaan Baru</span>
                 </button>
              </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:sticky lg:top-[120px] space-y-4">
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
                        <div className="bg-slate-50 dark:bg-slate-900 dark:bg-opacity-50 rounded-xl p-3 space-y-2 border border-slate-100 dark:border-slate-800">
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
                      <div className="flex justify-between items-center bg-indigo-50 bg-opacity-50 dark:bg-orange-900 dark:bg-opacity-20 p-2 rounded-lg">
                         <span className="text-[10px] font-bold text-slate-600 dark:text-orange-400 uppercase">Grand Total</span>
                         <span className="text-sm font-mono font-black text-indigo-700 dark:text-orange-500">{formatIdr(recap.total)}</span>
                      </div>
                   </div>
                </div>

                <div className="p-5 bg-slate-50 dark:bg-slate-900 dark:bg-opacity-50 space-y-3">
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
                      <div className={`text-xs font-mono font-bold px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border flex justify-between items-center ${projectMeta.hsp_value >= recap.rounded ? 'text-emerald-600 border-emerald-100 dark:border-emerald-900 dark:border-opacity-30' : 'text-red-500 border-red-100 dark:border-red-900 dark:border-opacity-30'}`}>
                         <span>Selisih:</span>
                         <span>{formatIdr(projectMeta.hsp_value - recap.rounded)}</span>
                      </div>
                   )}
                   <div className="p-5">
                      <button onClick={saveRab} disabled={saving} className="w-full py-3.5 bg-indigo-600 dark:bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-md hover:shadow-[0_10px_30px_rgba(79,70,229,0.4)] dark:hover:shadow-[0_10px_30px_rgba(249,115,22,0.4)] hover:translate-y-[-2px] transition-all duration-300 flex items-center justify-center gap-2">
                         {saving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />} {saving ? 'Menyimpan...' : 'Simpan RAB'}
                      </button>
                   </div>
                </div>
             </div>

              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900 dark:bg-opacity-30 rounded-2xl flex items-center justify-center text-indigo-600"><Info className="w-5 h-5" /></div>
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-tight">Gunakan item &quot;Lumpsum&quot; untuk pekerjaan manual yang tidak ada di katalog.</div>
              </div>
        </div>
      </div>
    </div>
  </div>
  );
}
