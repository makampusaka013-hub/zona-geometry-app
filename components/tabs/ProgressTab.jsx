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
  CheckCircle2,
  ClipboardList,
  Box
} from 'lucide-react';
import Spinner from '../Spinner';
import ModernConfirmModal from '../ModernConfirmModal';

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
  isPro,
  currentUserId
}) {
  const [progressData, setProgressData] = useState({}); // { [entity_id|name]: { [day]: val } }
  const [dailyReports, setDailyReports] = useState({}); // { [day]: { weather_index, weather_description } }
  const [customRoles, setCustomRoles] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, rowId: null });
  const [viewStartIndex, setViewStartIndex] = useState(0);
  const daysPerPage = 7;

  // ── Load Existing Progress ──
  useEffect(() => {
    if (activeTab !== 'progress' || !projectId) return;
    async function loadProgress() {
      setLoadingProgress(true);
      const [progressRes, reportsRes] = await Promise.all([
        supabase.from('project_progress_daily').select('*').eq('project_id', projectId).eq('created_by', currentUserId),
        supabase.from('daily_reports').select('*').eq('project_id', projectId)
      ]);

      if (!progressRes.error && progressRes.data) {
        const mapped = {};
        const customs = new Set();
        progressRes.data.forEach(row => {
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

      if (!reportsRes.error && reportsRes.data) {
        const reportMap = {};
        reportsRes.data.forEach(r => {
          const d = new Date(r.report_date);
          const start = new Date(projectStartDate);
          const diff = Math.round((d - start) / (1000 * 60 * 60 * 24)) + 1;
          reportMap[diff] = {
            weather_index: r.weather_index,
            weather_description: r.weather_description
          };
        });
        setDailyReports(reportMap);
      }
      setLoadingProgress(false);
    }
    loadProgress();
  }, [activeTab, projectId, currentUserId, projectStartDate]);

  const saveTimeout = useRef(null);
  const saveQueue = useRef([]);

  const handleManualSave = async () => {
    setSavingStatus('saving');
    try {
      const payload = [];
      Object.entries(progressData).forEach(([key, days]) => {
        const row = rows.find(r => (r.id || r.name) === key);
        if (!row) return;

        Object.entries(days).forEach(([day, val]) => {
          payload.push({
            project_id: projectId,
            entity_type: row.type,
            entity_id: row.id,
            entity_name: row.type === 'custom_labor' ? row.name : null,
            entity_key: key,
            day_number: parseInt(day),
            val: Number(val),
            created_by: currentUserId,
            updated_at: new Date().toISOString()
          });
        });
      });

      if (payload.length === 0) {
        setSavingStatus(null);
        return;
      }

      const { error } = await supabase
        .from('project_progress_daily')
        .upsert(payload, { onConflict: 'project_id,day_number,entity_type,entity_key,created_by' });

      if (error) throw error;
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus(null), 2000);
    } catch (err) {
      console.error('Manual save failed:', err);
      setSavingStatus('error');
      setTimeout(() => setSavingStatus(null), 3000);
    }
  };

  const updateCell = (entityId, entityName, type, day, value) => {
    const val = parseFloat(value) || 0;
    const key = entityId || entityName;

    setProgressData(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [day]: val
      }
    }));

    setSavingStatus('saving');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveQueue.current.push({
      project_id: projectId,
      entity_type: type,
      entity_id: entityId,
      entity_name: entityName,
      entity_key: key,
      day_number: day,
      val,
      created_by: currentUserId
    });

    saveTimeout.current = setTimeout(async () => {
      const unique = {};
      saveQueue.current.forEach(q => {
        const k = `${q.entity_key}-${q.day_number}`;
        unique[k] = q;
      });
      const payload = Object.values(unique);
      saveQueue.current = [];

      const { error } = await supabase
        .from('project_progress_daily')
        .upsert(payload, { onConflict: 'project_id,day_number,entity_type,entity_key,created_by' });

      if (error) console.error('Save failed:', error);
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus(null), 2000);
    }, 1500);
  };

  const updateWeather = async (day, field, value) => {
    const newReports = {
      ...dailyReports,
      [day]: {
        ...(dailyReports[day] || { weather_index: 1, weather_description: '' }),
        [field]: value
      }
    };
    setDailyReports(newReports);

    const reportDate = new Date(projectStartDate);
    reportDate.setDate(reportDate.getDate() + (day - 1));

    const { error } = await supabase
      .from('daily_reports')
      .upsert({
        project_id: projectId,
        report_date: reportDate.toISOString().split('T')[0],
        [field]: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'project_id,report_date' });

    if (error) console.error('Weather save failed:', error);
  };

  const handleStatusUpdate = (e, lineId, newStatus) => {
    e.stopPropagation();
    if (onUpdateStatus) onUpdateStatus(lineId, newStatus);
  };

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
    }

    // Heuristic Helper for Resources
    const getJenis = (r) => {
      const rawJ = (r.jenis || r.jenis_komponen || '').toLowerCase();
      const code = (r.kode_item || r.key_item || '').trim().toUpperCase();
      const unit = (r.satuan || '').toUpperCase();
      const name = (r.uraian || '').toLowerCase();

      // 1. Prioritas Satuan (Signal paling kuat)
      if (unit === 'OH' || unit === 'ORG') return 'upah';
      if (unit === 'JAM' || unit === 'SEWA') return 'alat';

      // 2. Keyword Nama
      if (/\b(pekerja|tukang|mandor|mekanik|sopir|driver)\b/.test(name)) return 'upah';
      if (/\b(sewa|excavator|vibro|stamper|mixer|crane|truck|pompa|genset|bulldozer|grader)\b/.test(name)) return 'alat';

      // 3. Jenis Explicit
      if (rawJ.includes('upah') || rawJ.includes('tenaga')) return 'upah';
      if (rawJ.includes('alat')) return 'alat';
      if (rawJ.includes('bahan') || rawJ.includes('material')) return 'bahan';

      // 4. Kode Prefiks (A=Tenaga, B=Bahan, C/E/M=Alat, L=Labor)
      if (code.startsWith('A')) return 'upah';
      if (code.startsWith('L')) return 'upah';
      if (code.startsWith('B')) return 'bahan';
      if (code.startsWith('C') || code.startsWith('M') || code.startsWith('E')) return 'alat';

      return 'bahan'; // Fallback
    };

    if (viewMode === 'material') {
      return (resources || []).filter(r => getJenis(r) === 'bahan').map(r => ({
        id: r.kode_item || r.uraian,
        name: r.uraian,
        unit: r.satuan,
        target: r.total_volume || 0,
        type: 'resource'
      }));
    } else if (viewMode === 'alat') {
      return (resources || []).filter(r => getJenis(r) === 'alat').map(r => ({
        id: r.kode_item || r.uraian,
        name: r.uraian,
        unit: r.satuan,
        target: r.total_volume || 0,
        type: 'resource'
      }));
    } else {
      const baseLabor = (resources || []).filter(r => getJenis(r) === 'upah').map(r => ({
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

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 w-full opacity-40 dark:opacity-20 pointer-events-none select-none">
        <Box className="w-24 h-24 mb-6 text-slate-500 dark:text-slate-400" strokeWidth={1} />
        <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.4em] text-center">
          BELUM ADA ITEM PEKERJAAN
        </h3>
      </div>
    );
  }

  return (
    <div className="w-full h-full space-y-4">
      <div className="flex justify-between items-center px-4 py-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-orange-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Laporan Harian - {viewMode === 'volume' ? 'Volume Pekerjaan' : viewMode === 'material' ? 'Material' : viewMode === 'alat' ? 'Alat' : 'Tenaga Kerja'}
          </span>
        </div>

        <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setViewStartIndex(prev => Math.max(0, prev - daysPerPage))}
            disabled={viewStartIndex === 0}
            className="p-2 bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm border border-slate-200 dark:border-slate-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col items-center min-w-[120px]">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Rentang Hari</span>
            <span className="text-[10px] font-black text-indigo-600 dark:text-orange-400 uppercase tracking-widest leading-none">
              {viewStartIndex + 1} - {Math.min(timeRange, viewStartIndex + daysPerPage)} dari {timeRange}
            </span>
          </div>
          <button
            onClick={() => setViewStartIndex(prev => Math.min(timeRange - 1, prev + daysPerPage))}
            disabled={viewStartIndex + daysPerPage >= timeRange}
            className="p-2 bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm border border-slate-200 dark:border-slate-700"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleManualSave}
          disabled={savingStatus === 'saving'}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 ${savingStatus === 'saving'
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white shadow-indigo-500/20 dark:shadow-orange-900/20'
            }`}
        >
          {savingStatus === 'saving' ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
          {savingStatus === 'saving' ? 'Menyimpan...' : 'Simpan Progress'}
        </button>
      </div>

      {/* ── Weather & Daily Notes Section ── */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2 px-4 mb-2">
        {Array.from({ length: Math.min(daysPerPage, timeRange - viewStartIndex) }).map((_, idx) => {
          const day = viewStartIndex + idx + 1;
          const report = dailyReports[day] || { weather_index: 1, weather_description: '' };
          return (
            <div key={day} className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2 shadow-sm">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">H-{day}</span>
                <select
                  value={report.weather_index || 1}
                  onChange={(e) => updateWeather(day, 'weather_index', parseInt(e.target.value))}
                  className="text-[10px] font-bold bg-transparent border-none focus:ring-0 text-indigo-600 dark:text-orange-400 cursor-pointer p-0"
                >
                  <option value={1}>☀️ Cerah</option>
                  <option value={2}>⛅ Berawan</option>
                  <option value={3}>🌦️ Gerimis</option>
                  <option value={4}>🌧️ Hujan</option>
                  <option value={5}>⛈️ Badai</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Ket. Cuaca/Kondisi..."
                value={report.weather_description || ''}
                onChange={(e) => updateWeather(day, 'weather_description', e.target.value)}
                className="text-[9px] font-bold bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-2 py-1 focus:ring-1 focus:ring-indigo-500/30 dark:focus:ring-orange-500/30 placeholder:opacity-50 text-slate-600 dark:text-slate-300"
              />
            </div>
          );
        })}
      </div>

      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#020617] overflow-hidden rounded-3xl shadow-sm mx-4">
        <div className="overflow-x-auto max-h-[700px] scrollbar-none relative">
          <table className="text-sm border-separate border-spacing-0 table-fixed min-w-full">
            <thead className="sticky top-0 z-50">
              <tr className="bg-slate-100 dark:bg-slate-900 text-[9px] uppercase font-black tracking-widest text-slate-500 dark:text-slate-400 shadow-sm">
                <th className="sticky left-0 z-50 bg-slate-100 dark:bg-slate-900 px-4 py-4 text-left w-[220px] border-b border-slate-200 dark:border-slate-800">Item</th>
                <th className="px-2 py-4 text-center w-[50px] border-b border-slate-200 dark:border-slate-800">Sat</th>
                <th className="px-3 py-4 text-right w-[80px] border-b border-slate-200 dark:border-slate-800">Target</th>
                <th className="px-3 py-4 text-right w-[80px] border-b border-slate-200 dark:border-slate-800">Real</th>
                <th className="px-3 py-4 text-right w-[90px] border-b border-slate-200 dark:border-slate-800">Selisih</th>
                {Array.from({ length: Math.min(daysPerPage, timeRange - viewStartIndex) }).map((_, idx) => {
                  const actualDayIdx = viewStartIndex + idx;
                  return (
                    <th key={actualDayIdx} className="px-1 py-4 text-center border-b border-slate-200 dark:border-slate-800 text-[8px] font-black w-[55px] bg-slate-100 dark:bg-slate-900">
                      H-{actualDayIdx + 1}<br /><span className="text-[7px] opacity-60 font-black uppercase text-slate-400 dark:text-slate-500">{getDateLabel(actualDayIdx)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {rows.map((row) => {
                const key = row.id || row.name;
                const isSelected = selectedRowId === key;
                const daily = progressData[key] || {};
                const totalReal = Object.values(daily).reduce((a, b) => a + b, 0);
                const diff = row.target - totalReal;
                const rowBgClass = isSelected ? 'bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-[#020617]';
                const babName = items.find(it => it.id === row.id)?.bab || '';

                return (
                  <tr key={key} onClick={() => setSelectedRowId(isSelected ? null : key)} className={`${isSelected ? 'bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-[#020617]'} hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer group`}>
                    <td className={`sticky left-0 z-10 ${rowBgClass} px-4 py-4 border-r border-slate-100 dark:border-slate-800/50 w-[220px]`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        {babName && <div className="text-[7px] text-indigo-600 dark:text-orange-400 font-black uppercase tracking-widest truncate max-w-[80px]">{babName}</div>}
                        {row.status_approval === 'final' && (
                          <span className="text-[7px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1 py-0.5 rounded uppercase flex items-center gap-1 shadow-sm">
                            <CheckCircle2 className="w-2 h-2" /> FINAL
                          </span>
                        )}
                        {row.status_approval === 'verified' && (
                          <span className="text-[7px] font-black bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-1 py-0.5 rounded uppercase flex items-center gap-1 shadow-sm">
                            <Save className="w-2 h-2" /> VERIFIED
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-slate-800 dark:text-white text-[11px] truncate leading-tight" title={row.name}>{row.name}</div>
                    </td>
                    <td className="px-2 py-4 text-center text-[10px] font-bold text-slate-500 w-[50px]">{row.unit}</td>
                    <td className="px-3 py-4 text-right text-[10px] font-mono font-bold text-slate-400 w-[80px]">{fmt(row.target)}</td>
                    <td className="px-3 py-4 text-right text-[10px] font-black text-indigo-600 dark:text-orange-400 w-[80px]">{fmt(totalReal)}</td>
                    <td className="px-3 py-4 text-right text-[10px] font-black w-[90px]">
                      <div className="flex flex-col items-end">
                        <span className={diff < 0 ? 'text-red-500' : 'text-emerald-500'}>{fmt(diff)}</span>
                        {row.type === 'ahsp_item' && (
                          <div className="flex gap-1 mt-1">
                            {canVerify && row.status_approval === 'draft' && (
                              <button onClick={(e) => handleStatusUpdate(e, row.id, 'verified')} className="text-[7px] font-black text-white bg-indigo-600 px-1.5 py-0.5 rounded">Verify</button>
                            )}
                            {canApproveFinal && row.status_approval === 'verified' && (
                              <button onClick={(e) => handleStatusUpdate(e, row.id, 'final')} className="text-[7px] font-black text-white bg-emerald-600 px-1.5 py-0.5 rounded">Final</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    {Array.from({ length: Math.min(daysPerPage, timeRange - viewStartIndex) }).map((_, idx) => {
                      const day = viewStartIndex + idx + 1;
                      return (
                        <td key={day} className="px-1 py-4 text-center w-[55px]">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={daily[day] || ''}
                            disabled={row.status_approval === 'verified' || row.status_approval === 'final' || ((!isAdmin && !isOwner && !isAdvance && !isPro && userSlotRole !== 'pembuat') || userSlotRole === 'pengecek')}
                            onChange={(e) => updateCell(row.id, row.type === 'custom_labor' ? row.name : null, row.type, day, e.target.value)}
                            className="w-full h-7 text-center text-[11px] font-black bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-1 focus:ring-indigo-500 transition-all outline-none text-slate-800 dark:text-white disabled:opacity-30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

      <div className="flex items-center gap-3 p-4 mx-4 rounded-2xl bg-indigo-50 dark:bg-orange-900/10 border border-indigo-100 dark:border-orange-900/20">
        <AlertCircle className="w-5 h-5 text-indigo-500 dark:text-orange-500" />
        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          <strong>TIP:</strong> Gunakan tombol arah panah atau Tab untuk berpindah antar hari dengan cepat. Perubahan disimpan otomatis dalam rentang 1.5 detik setelah Anda berhenti mengetik. Data progres ini akan menyusun rekapitulasi Laporan Harian secara otomatis.
        </p>
      </div>

      <ModernConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, rowId: null })}
        onConfirm={async () => {
          if (!confirmModal.rowId) return;
          setSavingStatus('saving');
          const { error } = await supabase.from('ahsp_lines').update({ status_approval: 'draft' }).eq('id', confirmModal.rowId);
          if (error) {
            alert('Gagal membatalkan status final: ' + error.message);
          } else {
            window.location.reload();
          }
          setSavingStatus(null);
        }}
        title="Batal Final?"
        message="Item ini akan di-reset ke status DRAFT secara paksa agar bisa diedit kembali."
        confirmText="Ya, Reset ke Draft"
        type="warning"
      />
    </div>
  );
}
