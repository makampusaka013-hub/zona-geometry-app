'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart3, 
  Package, 
  Users, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Save, 
  Trash2,
  TrendingUp,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import Spinner from '../Spinner';

function fmt(n) { return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }); }

export default function ProgressTab({ 
  projectId, 
  activeTab, 
  tabLoading, 
  items, // ahsp_lines
  resources, // tabData.harga (bahans, upahs, alats)
  viewMode, // volume, material, labor
  setViewMode,
  timeRange, // 90, 180, 365
  setTimeRange,
  projectStartDate,
  userSlotRole,
  isAdmin,
  canVerify,
  canApproveFinal,
  savingStatus,
  setSavingStatus,
  onUpdateStatus,
  isOwner,
  isModeNormal,
  isAdvance,
  isPro
}) {
  const [progressData, setProgressData] = useState({}); // { [entity_id|name]: { [day]: val } }
  const [customRoles, setCustomRoles] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedRowId, setSelectedRowId] = useState(null);

  // ── Load Existing Progress ──
  useEffect(() => {
    if (activeTab !== 'progress' || !projectId) return;
    async function loadProgress() {
      setLoadingProgress(true);
      const { data, error } = await supabase
        .from('project_progress_daily')
        .select('*')
        .eq('project_id', projectId);
      
      if (!error && data) {
        const mapped = {};
        const customs = new Set();
        data.forEach(row => {
          const key = row.entity_id || row.entity_name;
          if (!mapped[key]) mapped[key] = {};
          mapped[key][row.day_number] = Number(row.val);
          if (row.entity_type === 'custom_labor' && !row.entity_id) {
            customs.add(row.entity_name);
          }
        });
        setProgressData(mapped);
        setCustomRoles(Array.from(customs));
      }
      setLoadingProgress(false);
    }
    loadProgress();
  }, [activeTab, projectId]);

  // ── Auto-save Logic (Debounced) ──
  const saveTimeout = useRef(null);
  const saveQueue = useRef([]);

  const updateCell = (entityId, entityName, type, day, value) => {
    const val = parseFloat(value) || 0;
    const key = entityId || entityName;
    
    // UI Update (Real-time)
    setProgressData(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [day]: val
      }
    }));

    // Queue for DB
    setSavingStatus('saving');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    
    saveQueue.current.push({ 
      project_id: projectId, 
      entity_type: type, 
      entity_id: entityId, 
      entity_name: entityName, 
      entity_key: key, // Match the new unified index
      day_number: day, 
      val 
    });

    saveTimeout.current = setTimeout(async () => {
      // Deduplicate queue (keep latest for each unique day+entity)
      const unique = {};
      saveQueue.current.forEach(q => {
        const k = `${q.entity_key}-${q.day_number}`;
        unique[k] = q;
      });
      const payload = Object.values(unique);
      saveQueue.current = [];

      const { error } = await supabase
        .from('project_progress_daily')
        .upsert(payload, { onConflict: 'project_id,day_number,entity_type,entity_key' });
      
      if (error) console.error('Save failed:', error);
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus(null), 2000);
    }, 1500);
  };

  const handleStatusUpdate = (e, lineId, newStatus) => {
    e.stopPropagation();
    if (onUpdateStatus) onUpdateStatus(lineId, newStatus);
  };

  // ── Computed Rows ──
  const rows = useMemo(() => {
    if (viewMode === 'volume') {
      return items.map(it => ({
        id: it.id,
        name: it.uraian_custom || it.uraian,
        unit: it.satuan,
        target: Number(it.volume),
        type: 'ahsp_item',
        status_approval: it.status_approval
      }));
    } else if (viewMode === 'material') {
      return (resources || []).filter(r => r.jenis === 'bahan' || r.jenis === 'alat').map(r => ({
        id: r.kode_item || r.uraian,
        name: r.uraian,
        unit: r.satuan,
        target: r.total_volume || 0,
        type: 'resource'
      }));
    } else {
      // labor
      const baseLabor = (resources || []).filter(r => r.jenis === 'upah').map(r => ({
        id: r.kode_item || r.uraian,
        name: r.uraian,
        unit: r.satuan,
        target: r.total_volume || 0,
        type: 'resource'
      }));
      const customs = (customRoles || []).map(name => ({
        id: null,
        name: name,
        unit: 'OH',
        target: 0,
        type: 'custom_labor'
      }));
      return [...baseLabor, ...customs];
    }
  }, [viewMode, items, resources, customRoles]);

  // Helper for dates
  const getDateLabel = (dayIdx) => {
    if (!projectStartDate) return null;
    const d = new Date(projectStartDate);
    d.setDate(d.getDate() + dayIdx);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const addCustomRole = () => {
    if (!newRoleName.trim()) return;
    if (customRoles.includes(newRoleName.trim())) return;
    setCustomRoles(prev => [...prev, newRoleName.trim()]);
    setNewRoleName('');
  };

  if (activeTab !== 'progress') return null;
  if (tabLoading || loadingProgress) return <Spinner />;

  return (
    <div className="w-full h-full">

      <div className="border-t-0 bg-white dark:bg-[#020617] overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 relative">
          <table 
            className="text-sm border-separate border-spacing-0 table-fixed min-w-[320px]"
            style={{ width: `calc(320px + (${timeRange} * 85px))` }}
          >
            <thead className="sticky top-0 z-50">
              <tr className="bg-slate-100 dark:bg-slate-900 text-[10px] uppercase font-black tracking-widest text-slate-500 dark:text-slate-400 shadow-sm">
                <th className="sticky left-0 z-50 bg-slate-100 dark:bg-slate-900 px-6 py-4 text-left w-[180px] lg:w-[300px] min-w-[180px] lg:min-w-[300px] border-b border-slate-200 dark:border-slate-800">Item Pekerjaan</th>
                <th className="lg:sticky lg:left-[300px] z-50 bg-slate-100 dark:bg-slate-900 px-3 py-4 text-center w-[60px] min-w-[60px] border-b border-slate-200 dark:border-slate-800">Sat</th>
                <th className="lg:sticky lg:left-[360px] z-50 bg-slate-100 dark:bg-slate-900 px-4 py-4 text-right w-[90px] min-w-[90px] border-b border-slate-200 dark:border-slate-800">Target</th>
                <th className="lg:sticky lg:left-[450px] z-50 bg-slate-100 dark:bg-slate-900 px-4 py-4 text-right w-[90px] min-w-[90px] border-b border-slate-200 dark:border-slate-800">Realisasi</th>
                <th className="lg:sticky lg:left-[540px] z-50 bg-slate-100 dark:bg-slate-900 px-4 py-4 text-right w-[100px] min-w-[100px] border-b border-slate-200 dark:border-slate-800">Selisih</th>
                {Array.from({ length: timeRange }).map((_, idx) => (
                  <th key={idx} className="px-4 py-4 text-center border-b border-slate-200 dark:border-slate-800 text-[9px] font-black w-[85px] min-w-[85px] whitespace-nowrap bg-slate-100 dark:bg-slate-900">
                    H-{idx + 1}<br/><span className="text-[8px] opacity-60 font-black uppercase text-slate-400 dark:text-slate-500">{getDateLabel(idx)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {rows.map((row) => {
                const key = row.id || row.name;
                const isSelected = selectedRowId === key;
                const daily = progressData[key] || {};
                const totalReal = Object.values(daily).reduce((a, b) => a + b, 0);
                const diff = row.target - totalReal;
                
                // Use OPAQUE backgrounds for sticky columns to prevent overlap visibility
                const rowBgNormal = 'bg-white dark:bg-[#020617]';
                const rowBgSelected = 'bg-slate-100 dark:bg-slate-800';
                const rowBgClass = isSelected ? rowBgSelected : rowBgNormal;

                const babName = items.find(it => it.id === row.id)?.bab || '';

                return (
                  <tr key={key} onClick={() => setSelectedRowId(isSelected ? null : key)} className={`${isSelected ? 'bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-[#020617]'} hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer group`}>
                    <td className={`sticky left-0 z-10 ${rowBgClass} px-6 py-6 border-r border-slate-100 dark:border-slate-800/50 truncate w-[180px] lg:w-[300px]`}>
                      <div className="flex items-center gap-2 mb-1">
                        {babName && <div className="text-[8px] text-indigo-600 dark:text-orange-400 font-black uppercase tracking-widest">{babName}</div>}
                        {row.status_approval === 'final' && (
                          <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded uppercase flex items-center gap-1 shadow-sm">
                            <CheckCircle2 className="w-2.5 h-2.5" /> FINAL
                          </span>
                        )}
                        {row.status_approval === 'verified' && (
                          <span className="text-[8px] font-black bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-1.5 py-0.5 rounded uppercase flex items-center gap-1 shadow-sm">
                            <Save className="w-2.5 h-2.5" /> VERIFIED
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-slate-800 dark:text-white text-[12px] tracking-tight" title={row.name}>{row.name}</div>
                    </td>
                    <td className={`lg:sticky lg:left-[300px] z-10 ${rowBgClass} px-3 py-6 text-center text-[10px] font-bold text-slate-500 border-r border-slate-100 dark:border-slate-800/50 w-[60px]}`}>{row.unit}</td>
                    <td className={`lg:sticky lg:left-[360px] z-10 ${rowBgClass} px-4 py-6 text-right text-[10px] font-mono font-bold text-slate-400 border-r border-slate-100 dark:border-slate-800/50 w-[90px]`}>{fmt(row.target)}</td>
                    <td className={`lg:sticky lg:left-[450px] z-10 ${rowBgClass} px-4 py-6 text-right text-[11px] font-black text-indigo-600 dark:text-orange-400 border-r border-slate-100 dark:border-slate-800/50 w-[90px]`}>{fmt(totalReal)}</td>
                    <td className={`lg:sticky lg:left-[540px] z-10 ${rowBgClass} px-4 py-6 text-right text-[11px] font-black border-r border-slate-100 dark:border-slate-800/50 w-[100px] ${diff < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      <div className="flex flex-col items-end gap-1.5">
                        <span>{fmt(diff)}</span>
                        
                        {/* Stakeholder Actions */}
                        {row.type === 'ahsp_item' && (
                          <div className="flex flex-col items-end gap-1">
                             {canVerify && row.status_approval === 'draft' && (
                               <button 
                                 onClick={(e) => handleStatusUpdate(e, row.id, 'verified')}
                                 className="text-[8px] font-black text-white uppercase bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded-md shadow-sm"
                               >
                                 Verifikasi
                               </button>
                             )}
                             {canVerify && row.status_approval === 'verified' && (
                               <button 
                                 onClick={(e) => handleStatusUpdate(e, row.id, 'draft')}
                                 className="text-[8px] font-black text-red-600 uppercase border border-red-200 px-2 py-1 rounded-md"
                               >
                                 Reject
                               </button>
                             )}
                             {(isOwner || isAdmin || isAdvance || isPro) && row.status_approval === 'final' && (
                               <button 
                                 onClick={(e) => handleStatusUpdate(e, row.id, 'verified')}
                                 className="text-[8px] font-black text-amber-600 uppercase border border-amber-200 px-2 py-1 rounded-md hover:bg-amber-50 transition-all"
                               >
                                 Batal Final
                               </button>
                             )}
                             {canApproveFinal && row.status_approval === 'verified' && (
                               <button 
                                 onClick={(e) => handleStatusUpdate(e, row.id, 'final')}
                                 className="text-[8px] font-black text-white uppercase bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-md shadow-sm"
                               >
                                 Set FINAL
                               </button>
                             )}
                          </div>
                        )}
                      </div>
                    </td>
                    
                    {Array.from({ length: timeRange }).map((_, idx) => {
                      const day = idx + 1;
                      return (
                        <td key={idx} className="px-2 py-6 text-center w-[85px]">
                          <input
                            type="number"
                            value={daily[day] || ''}
                            disabled={row.status_approval === 'verified' || row.status_approval === 'final' || ((!isAdmin && !isOwner && !isAdvance && !isPro && userSlotRole !== 'pembuat') || userSlotRole === 'pengecek')}
                            onChange={(e) => updateCell(row.id, row.type === 'custom_labor' ? row.name : null, row.type, day, e.target.value)}
                            className={`w-16 h-8 text-center text-xs font-black bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-full focus:ring-4 focus:ring-indigo-500/10 dark:focus:ring-orange-500/10 focus:border-indigo-500 dark:focus:border-orange-500 transition-all outline-none text-indigo-600 dark:text-orange-400 disabled:opacity-30 disabled:cursor-not-allowed`}
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewMode === 'labor' && (
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
          <TrendingUp className="w-5 h-5 text-indigo-500" />
          <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">Tambah Peran Non-PROYEK:</span>
          <div className="flex-1 max-w-sm flex gap-2">
            <input 
              type="text" 
              placeholder="Misal: PPK, Inspektorat, PPTK..."
              value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              className="flex-1 text-xs font-bold bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            <button onClick={addCustomRole}
              className="flex items-center gap-2 bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white px-8 py-3 rounded-2xl font-black text-xs shadow-xl shadow-indigo-500/20 dark:shadow-none disabled:opacity-50 transition-all">
              <Plus className="w-4 h-4" /> TAMBAH BARIS
            </button>
          </div>
          <p className="text-[10px] text-slate-400 ml-auto italic">* Digunakan untuk mencatat kehadiran petugas luar di lapangan</p>
        </div>
      )}

      <div className="flex items-center gap-3 p-4 rounded-2xl bg-indigo-50 dark:bg-orange-900/10 border border-indigo-100 dark:border-orange-900/20">
        <AlertCircle className="w-5 h-5 text-indigo-500 dark:text-orange-500" />
        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          <strong>TIP:</strong> Gunakan tombol arah panah atau Tab untuk berpindah antar hari dengan cepat. Perubahan disimpan otomatis dalam rentang 1.5 detik setelah Anda berhenti mengetik. Data progres ini akan menyusun rekapitulasi Laporan Harian secara otomatis.
        </p>
      </div>
    </div>
  );
}
