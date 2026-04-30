import React from 'react';
import { CalendarDays, Clock, Users } from 'lucide-react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, LabelList, Cell, ReferenceLine, Label } from 'recharts';
import Spinner from './Spinner';

function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(n || 0);
}
function fmt(n) { return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }); }

export default function ScheduleTab({
  tabLoading,
  tabData,
  manpowerItems,
  sequencedSchedule,
  scheduleGanttData,
  projectStartDate,
  setProjectStartDate,
  scheduleRange,
  setScheduleRange,
  manpowerSummary,
  setShowCalendar,
  startDates,
  saveStartDate,
  selectedBab,
  globalLaborRoles,
  laborSettings,
  setLaborSettings,
  selectedProject,
  projects,
  supabase,
  saveItemWorkers,
  saveItemDurasi,
  savingField,
  userSlotRole,
  isAdmin,
  isAdvance,
  isPro
}) {
  const [showGantt, setShowGantt] = React.useState(false);
  const [showGlobalLabor, setShowGlobalLabor] = React.useState(false);

  const filteredSchedule = React.useMemo(() => {
    if (!selectedBab || selectedBab === 'all') return sequencedSchedule;
    return sequencedSchedule.filter(r => r.bab === selectedBab);
  }, [sequencedSchedule, selectedBab]);

  const filteredGantt = React.useMemo(() => {
    if (!selectedBab || selectedBab === 'all') return scheduleGanttData;
    return scheduleGanttData.filter(d => d.bab === selectedBab);
  }, [scheduleGanttData, selectedBab]);

  const { minDur, maxDur } = React.useMemo(() => {
    if (!filteredGantt.length) return { minDur: 0, maxDur: 0 };
    const durs = filteredGantt.map(d => d.durasi);
    return { minDur: Math.min(...durs), maxDur: Math.max(...durs) };
  }, [filteredGantt]);

  const todayOffset = React.useMemo(() => {
    if (!projectStartDate) return null;
    const start = new Date(projectStartDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - start) / 86400000);
    return diff >= 0 ? diff : null;
  }, [projectStartDate]);

  if (tabLoading) return <Spinner />;

  if (tabData.schedule.lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e293b] text-center py-16 text-slate-400">
        <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="font-bold">Belum ada data RAB. Tambahkan AHSP ke proyek untuk melihat jadwal.</p>
      </div>
    );
  }

  const getDurColor = (dur) => {
    if (dur === null) return '#e2e8f0';
    const isDark = document.documentElement.classList.contains('dark');
    if (maxDur === minDur) return isDark ? '#f97316' : '#3b82f6';
    const ratio = (dur - minDur) / (maxDur - minDur);
    if (isDark) {
      // Orange gradient for dark mode
      const r = Math.round(251 + ratio * (234 - 251));
      const g = Math.round(146 + ratio * (179 - 146));
      const b = Math.round(60 + ratio * (8 - 60));
      return `rgb(${r}, ${g}, ${b})`;
    }
    // Blue gradient for light mode
    const r = Math.round(59 + ratio * (239 - 59));
    const g = Math.round(130 + ratio * (68 - 130));
    const b = Math.round(246 + ratio * (68 - 246));
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="flex flex-col gap-0 w-full h-full relative">
      {/* ── STICKY CONTROL HEADER (Harmonized) ── */}
      <div className="sticky top-[-1px] z-[60] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-4 border-b border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2">
                Kalkulasi Manpower Per Item
                <span className="bg-indigo-500/10 dark:bg-orange-500/10 text-indigo-500 dark:text-orange-500 px-2 py-0.5 rounded text-[8px] font-black tracking-widest animate-pulse">REALTIME</span>
              </h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                Proyek Terpilih: {selectedProject && projects[selectedProject]?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 px-4 py-2 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-orange-500" />
            <input type="date" value={projectStartDate}
              disabled={userSlotRole === 'normal' && !isAdmin && !isAdvance && !isPro}
              onChange={e => setProjectStartDate(e.target.value)}
              className="text-xs font-black bg-transparent border-0 focus:ring-0 p-0 text-slate-700 dark:text-white disabled:opacity-50" />
            <CalendarDays className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-full border border-slate-200 dark:border-slate-800">
            <button onClick={() => setShowGantt(!showGantt)} className={`flex items-center gap-2 px-5 py-2 rounded-full text-[9px] font-black transition-all ${showGantt ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md' : 'text-slate-500 hover:bg-white/50'}`}>
              <BarChart className="w-3 h-3" /> GANTT
            </button>
            <button onClick={() => setShowGlobalLabor(!showGlobalLabor)} className={`flex items-center gap-2 px-5 py-2 rounded-full text-[9px] font-black transition-all ${showGlobalLabor ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-md' : 'text-slate-500 hover:bg-white/50'}`}>
              <Users className="w-3 h-3" /> TENAGA
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[8px] font-black text-slate-400 tracking-widest mb-0.5 uppercase">Est. Durasi</div>
              <div className="text-xl font-black text-indigo-500 dark:text-orange-500 tracking-tighter">{manpowerSummary?.projectTotalDays || 0} HARI</div>
            </div>
            <button onClick={() => setShowCalendar(true)} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-indigo-500 dark:hover:bg-orange-600 hover:text-white transition-all shadow-sm group">
              <CalendarDays className="w-5 h-5 text-slate-500 group-hover:text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Level 4: Conditional Panels ── */}
      {showGantt && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e293b] shadow-xl overflow-hidden animate-in slide-in-from-top-2 duration-300 mb-6">
          <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest leading-none">📊 Gantt Chart — Jadwal Pekerjaan</h3>
          </div>
          <div className="p-4 max-h-[300px] overflow-y-auto scrollbar-thin">
            <ResponsiveContainer width="100%" height={Math.max(200, filteredGantt.length * 40)}>
              <BarChart data={filteredGantt} layout="vertical" margin={{ left: 8, right: 90, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f010" />
                <XAxis type="number" domain={[0, scheduleRange]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={165} tick={{ fontSize: 9.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-slate-900 text-slate-100 p-3 rounded-xl border border-slate-700 shadow-2xl text-[10px]">
                        <p className="font-black mb-1">{d.fullName}</p>
                        <p className="font-bold text-indigo-400 dark:text-orange-400">⏱️ {d.durasi} HARI</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="offset" stackId="gantt" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="durasi" stackId="gantt" radius={[0, 10, 10, 0]}>
                  <LabelList dataKey="durasi" position="right" style={{ fontSize: 9, fontWeight: 900, fill: '#4f46e5' }} offset={8} formatter={v => `${v}H`} />
                  {filteredGantt.map((item, i) => (
                    <Cell key={i} fill={item.exceeded ? '#ef4444' : getDurColor(item.durasi)} />
                  ))}
                </Bar>
                {todayOffset !== null && todayOffset <= scheduleRange && (
                  <ReferenceLine x={todayOffset} stroke="#f97316" strokeDasharray="3 3" strokeWidth={2}>
                    <Label value="HARI INI" position="top" fill="#f97316" fontSize={8} fontWeight={900} offset={10} />
                  </ReferenceLine>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showGlobalLabor && (
        <div className="bg-white dark:bg-[#020617] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-4 animate-in fade-in duration-300 mb-6">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Users className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[10px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest leading-none">Kapasitas Tenaga Kerja Global</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {globalLaborRoles.map(role => {
              const count = laborSettings[role]?.count ?? 1;
              const eff = laborSettings[role]?.eff || 100;
              return (
                <div key={role} className="flex flex-col bg-slate-50/50 dark:bg-slate-900/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 dark:hover:border-orange-500/30 transition-colors">
                  <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 mb-3 truncate">{role}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Org</label>
                      <input type="number" value={count} onChange={e => setLaborSettings({ ...laborSettings, [role]: { ...laborSettings[role], count: e.target.value } })}
                        className="w-full text-xs font-black bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-orange-500/20 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Ef (%)</label>
                      <input type="number" value={eff} onChange={e => setLaborSettings({ ...laborSettings, [role]: { ...laborSettings[role], eff: e.target.value } })}
                        className="w-full text-xs font-black bg-indigo-50 dark:bg-orange-500/5 border border-indigo-200 dark:border-orange-500/20 rounded-xl px-3 py-1.5 text-indigo-600 dark:text-orange-400" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* ── INTERNAL SCROLL DATA TABLE (Minimalist Design - No Scroll) ── */}
      <div className="rounded-b-[32px] border-x border-b border-slate-200 dark:border-slate-800 overflow-x-auto max-h-[70vh] scrollbar-thin bg-white dark:bg-[#020617] shadow-2xl relative">
        <table className="w-full text-sm border-separate border-spacing-0 table-fixed min-w-[900px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-50 dark:bg-slate-900/80 backdrop-blur-sm text-[9px] uppercase font-black tracking-widest text-slate-500 dark:text-slate-400 shadow-sm transition-all">
              <th className="px-4 py-4 text-left border-b border-slate-200 dark:border-slate-800 w-[50px]">No</th>
              <th className="px-4 py-4 text-left border-b border-slate-200 dark:border-slate-800 min-w-[250px]">Uraian</th>
              <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 w-[80px]">Vol</th>
              <th className="px-4 py-4 text-center border-b border-slate-200 dark:border-slate-800 w-[110px]">Pekerja</th>
              <th className="px-4 py-4 text-center border-b border-slate-200 dark:border-slate-800 w-[110px]">Durasi</th>
              <th className="px-4 py-4 text-center border-b border-slate-200 dark:border-slate-800 w-[110px]">Jadwal</th>
              <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 w-[120px]">Biaya Upah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {filteredSchedule.map((r, i) => {
              const isSavingW = savingField === `${r.id}:workers`;
              const isSavingD = savingField === `${r.id}:durasi`;
              return (
                <tr key={r.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-all group border-b border-slate-50 dark:border-slate-800/40 last:border-0">
                  <td className="px-4 py-3 text-left text-[10px] font-black text-slate-300 dark:text-slate-600 border-r border-slate-100/50 dark:border-slate-800/30">{i + 1}</td>
                  <td className="px-4 py-3 border-r border-slate-100/50 dark:border-slate-800/30">
                    <div className="text-[8px] text-indigo-500/60 dark:text-orange-500/60 font-black uppercase tracking-widest mb-0.5 truncate">{r.bab}</div>
                    <div className="font-bold text-slate-800 dark:text-white text-[11px] leading-snug whitespace-normal break-words">{r.uraian}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[10px] font-bold text-slate-400">{fmt(r.volume)}</td>

                  <td className="px-4 py-3 text-center">
                    <div className="relative inline-block scale-90 origin-center">
                      <input type="number" defaultValue={r.pekerja_input || ''} placeholder="auto"
                        disabled={r.status_approval === 'final' || (userSlotRole === 'normal' && !isAdmin && !isAdvance && !isPro) || !!r.durasi_input}
                        onBlur={e => saveItemWorkers(r.id, e.target.value)}
                        className="w-20 text-center text-[10px] font-black bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl py-2 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-orange-500/20 focus:border-indigo-500 transition-all outline-none disabled:opacity-30" />
                      {r.pekerja !== null && <div className="text-[9px] font-black mt-1 text-indigo-400 dark:text-orange-400">{r.pekerja} OH</div>}
                      {isSavingW && <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500 animate-ping" />}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <div className="relative inline-block scale-90 origin-center">
                      <input type="number" defaultValue={r.durasi_input || ''} placeholder="auto"
                        disabled={r.status_approval === 'final' || (userSlotRole === 'normal' && !isAdmin && !isAdvance && !isPro) || !!r.pekerja_input}
                        onBlur={e => saveItemDurasi(r.id, e.target.value)}
                        className="w-20 text-center text-[10px] font-black bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl py-2 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-orange-500/20 focus:border-indigo-500 transition-all outline-none disabled:opacity-30" />
                      {r.durasi_hari !== null && <div className="text-[9px] font-black mt-1 text-indigo-400 dark:text-orange-400">{r.durasi_hari} H</div>}
                      {isSavingD && <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500 animate-ping" />}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1.5 opacity-80">
                        <input type="date" value={startDates?.[r.id] || r.seq_start || ''}
                          disabled={r.status_approval === 'final' || (userSlotRole === 'normal' && !isAdmin && !isAdvance && !isPro)}
                          onChange={e => saveStartDate?.(r.id, e.target.value)}
                          className="text-[10px] font-bold bg-transparent border-0 focus:ring-0 p-0 text-slate-600 dark:text-slate-300 disabled:opacity-30 w-18" />
                      </div>
                      <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                        s/d {r.seq_end ? new Date(r.seq_end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—'}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-[11px] font-bold text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-orange-500 transition-colors">
                    {formatIdr(r.total_upah)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-slate-50 dark:bg-slate-900 text-[11px] font-black overflow-hidden border-t border-slate-200 dark:border-slate-800">
            <tr>
              <td colSpan={6} className="px-4 py-3 text-right text-[9px] uppercase tracking-widest text-slate-400">Total Upah Proyek</td>
              <td className="px-4 py-3 text-right font-mono text-indigo-500 dark:text-orange-500">{formatIdr(manpowerSummary.totalUpah)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
