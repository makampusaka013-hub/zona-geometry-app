'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, ArrowLeft, Flag, CheckCircle2, Info } from 'lucide-react';

/* ── Color palette per BAB ─────────────────────────────── */
const BAB_COLORS = [
  { bg: 'bg-indigo-500',  text: 'text-white', light: 'bg-indigo-100 text-indigo-800',  dot: 'bg-indigo-500'  },
  { bg: 'bg-emerald-500', text: 'text-white', light: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-500',   text: 'text-white', light: 'bg-amber-100 text-amber-800',    dot: 'bg-amber-500'   },
  { bg: 'bg-rose-500',    text: 'text-white', light: 'bg-rose-100 text-rose-800',      dot: 'bg-rose-500'    },
  { bg: 'bg-violet-500',  text: 'text-white', light: 'bg-violet-100 text-violet-800',  dot: 'bg-violet-500'  },
  { bg: 'bg-cyan-500',    text: 'text-white', light: 'bg-cyan-100 text-cyan-800',      dot: 'bg-cyan-500'    },
  { bg: 'bg-orange-500',  text: 'text-white', light: 'bg-orange-100 text-orange-800',  dot: 'bg-orange-500'  },
  { bg: 'bg-pink-500',    text: 'text-white', light: 'bg-pink-100 text-pink-800',      dot: 'bg-pink-500'    },
];

/* ── Indonesian Holidays 2026 (Based on SKB 3 Menteri) ── */
const HOLIDAYS_2026 = {
  '01-01': 'Tahun Baru Masehi',
  '01-16': 'Isra Mi\'raj',
  '02-17': 'Tahun Baru Imlek',
  '03-19': 'Hari Suci Nyepi',
  '03-21': 'Idul Fitri 1447 H',
  '03-22': 'Idul Fitri 1447 H',
  '04-03': 'Wafat Yesus Kristus',
  '04-05': 'Kebangkitan Yesus Kristus (Paskah)',
  '05-01': 'Hari Buruh Internasional',
  '05-14': 'Kenaikan Yesus Kristus',
  '05-27': 'Idul Adha 1447 H',
  '05-31': 'Hari Raya Waisak',
  '01-06': 'Hari Lahir Pancasila', // Corrected: June 1st
  '06-01': 'Hari Lahir Pancasila',
  '06-16': 'Tahun Baru Islam 1448 H',
  '08-17': 'Hari Kemerdekaan RI',
  '08-25': 'Maulid Nabi Muhammad SAW',
  '12-25': 'Hari Raya Natal',
};

const DAY_LABELS  = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_LABELS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

/* ── Helpers ─────────────────────────────────────────────── */
function toDateObj(str) {
  if (!str) return null;
  const d = new Date(str);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoStr(d) {
  return d.toISOString().slice(0, 10);
}

function mmdd(d) {
  return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/**
 * CalendarModal v3 — Enhanced with Holidays & Termins
 */
export default function CalendarModal({ items, scheduleRange, onClose, projectStartDate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view, setView]           = useState('year');
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  /* ── Color map per BAB ─────────────────────────────────── */
  const babColorMap = useMemo(() => {
    const map = {};
    let idx = 0;
    items.forEach(item => {
      if (item.bab && !map[item.bab]) {
        map[item.bab] = BAB_COLORS[idx % BAB_COLORS.length];
        idx++;
      }
    });
    return map;
  }, [items]);

  /* ── Events indexed by ISO date string ─────────────────── */
  const eventsByDate = useMemo(() => {
    const map = {};
    items
      .filter(item => item.seq_start && item.durasi_hari && item.durasi_hari <= scheduleRange)
      .forEach(ev => {
        const sd = toDateObj(ev.seq_start);
        const ed = toDateObj(ev.seq_end);
        if (!sd) return;
        
        const sk = isoStr(sd);
        if (!map[sk]) map[sk] = [];
        map[sk].push({ ...ev, type: 'start', color: babColorMap[ev.bab] || BAB_COLORS[0] });

        if (ed && !sameDay(sd, ed)) {
          const ek = isoStr(ed);
          if (!map[ek]) map[ek] = [];
          map[ek].push({ ...ev, type: 'end', color: babColorMap[ev.bab] || BAB_COLORS[0] });
        }
      });
    return map;
  }, [items, babColorMap, scheduleRange]);

  /* ── Payment Terms (Termin) Logic ──────────────────────── */
  const terminMap = useMemo(() => {
    if (!projectStartDate) return {};
    const map = {}; // { iso: { label: 'T1', pct: '20%' } }
    const start = new Date(projectStartDate);
    start.setHours(0, 0, 0, 0);

    const percentages = ['20%', '40%', '60%', '80%', '100%'];

    for (let t = 1; t <= 5; t++) {
      const tStart = new Date(start);
      tStart.setDate(start.getDate() + (t - 1) * 7);
      
      const k = isoStr(tStart);
      map[k] = { label: `T${t}`, pct: percentages[t - 1] };
    }
    return map;
  }, [projectStartDate]);

  /* ── Month grid helpers ─────────────────────────────────── */
  function buildMonthGrid(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const firstDow = firstDay.getDay(); 
    const days = [];
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(i);
    return { days, firstDow };
  }

  /* ── Navigation ─────────────────────────────────────────── */
  const prevYear  = () => setViewYear(y => y - 1);
  const nextYear  = () => setViewYear(y => y + 1);
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const openMonth = (month) => { setViewMonth(month); setView('month'); };
  const backToYear = () => setView('year');

  /* ── YEARLY Overview ────────────────────────────────────── */
  function YearView() {
    return (
      <div className="flex-1 overflow-auto p-4 scrollbar-thin">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {MONTH_LABELS.map((name, mi) => {
            const isCurrentMonth = mi === today.getMonth() && viewYear === today.getFullYear();
            return (
              <button
                key={mi} onClick={() => openMonth(mi)}
                className={`flex flex-col p-4 rounded-3xl border transition-all text-left group hover:shadow-xl ${
                  isCurrentMonth ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{MONTH_SHORT[mi]}</span>
                  {isCurrentMonth && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
                </div>
                <MiniGrid year={viewYear} month={mi} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function MiniGrid({ year, month }) {
    const { days, firstDow } = buildMonthGrid(year, month);
    return (
      <div className="w-full">
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDow }).map((_, i) => <div key={i} className="aspect-square" />)}
          {days.map(d => {
            const dt = new Date(year, month, d);
            const isSun = dt.getDay() === 0;
            const hol = HOLIDAYS_2026[mmdd(dt)];
            const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            return (
              <div key={d} className={`aspect-square flex items-center justify-center text-[7px] font-bold rounded-sm ${
                isToday ? 'bg-indigo-600 text-white' : (isSun || hol) ? 'text-red-500' : 'text-slate-400 dark:text-slate-600'
              }`}>{d}</div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── MONTHLY Detail View ────────────────────────────────── */
  function MonthView() {
    const { days, firstDow } = buildMonthGrid(viewYear, viewMonth);

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 bg-slate-50 dark:bg-slate-900/50">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={`py-4 text-center text-[10px] font-black uppercase tracking-widest ${i === 0 ? 'text-red-500' : 'text-slate-400'}`}>
              {d}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-1 scrollbar-thin">
          <div className="grid grid-cols-7 min-h-full">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} className="border-r border-b border-slate-50 dark:border-slate-800/40 p-2 opacity-20" />
            ))}
            {days.map(dayNum => {
              const dateObj = new Date(viewYear, viewMonth, dayNum);
              const iso = isoStr(dateObj);
              const dayEvs = eventsByDate[iso] || [];
              const isSun = dateObj.getDay() === 0;
              const holidayName = viewYear === 2026 ? HOLIDAYS_2026[mmdd(dateObj)] : null;
              const termin = terminMap[iso];
              const today_ = sameDay(dateObj, today);

              return (
                <div key={dayNum} className={`min-h-[110px] border-r border-b border-slate-50 dark:border-slate-800/40 p-2 flex flex-col gap-1.5 transition-colors ${
                  today_ ? 'bg-indigo-50/30' : (isSun || holidayName) ? 'bg-red-50/20 dark:bg-red-950/5' : ''
                }`}>
                  <div className="flex items-start justify-between">
                    <div className={`text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full transition-all ${
                      today_ ? 'bg-indigo-600 text-white shadow-lg' : (isSun || holidayName) ? 'text-red-500 bg-red-100/50 dark:bg-red-900/20' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {dayNum}
                    </div>
                    {termin && (
                      <div className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm animate-bounce">
                        {termin.label} ({termin.pct})
                      </div>
                    )}
                  </div>

                  {/* Holiday Label */}
                  {holidayName && (
                    <div className="text-[7px] font-black text-red-600 dark:text-red-400 uppercase leading-tight bg-red-100 dark:bg-red-900/30 px-1 py-0.5 rounded">
                      ✨ {holidayName}
                    </div>
                  )}

                  {/* Day Events */}
                  <div className="flex flex-col gap-1 mt-auto">
                    {dayEvs.map((ev, ei) => (
                      <div key={ei} className={`text-[8px] font-black px-2 py-1 rounded-lg border-l-2 flex items-center justify-between shadow-sm ${
                        ev.type === 'start' 
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-500' 
                          : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-500'
                      }`}>
                        <div className="flex items-center gap-1.5 truncate">
                          {ev.type === 'start' ? <Flag className="w-2 h-2" /> : <CheckCircle2 className="w-2 h-2" />}
                          <span className="truncate">{ev.uraian}</span>
                        </div>
                        <span className="text-[6px] opacity-70 ml-1">{ev.type === 'start' ? 'OPEN' : 'END'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ── MAIN COMPONENT HEADER ── */
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] w-full max-w-6xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden" 
        style={{ height: '90vh' }}>
        
        {/* Header Bar */}
        <div className="px-8 py-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-4">
            {view === 'month' && (
              <button onClick={backToYear} className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 transition-all">
                <ArrowLeft className="w-5 h-5 text-indigo-600 dark:text-amber-400" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                {view === 'year' ? `KALENDER PROYEK ${viewYear}` : `${MONTH_LABELS[viewMonth].toUpperCase()} ${viewYear}`}
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-3 py-1 rounded-full uppercase tracking-widest">{view === 'year' ? 'Overview' : 'Detail'}</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl shadow-inner">
              <button onClick={view === 'year' ? prevYear : prevMonth} className="p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-all text-slate-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-[100px] text-center text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">
                {view === 'year' ? viewYear : MONTH_SHORT[viewMonth]}
              </div>
              <button onClick={view === 'year' ? nextYear : nextMonth} className="p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-all text-slate-500">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-100 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        {view === 'year' ? <YearView /> : <MonthView />}

        {/* Footer / Legend */}
        <div className="px-8 py-4 bg-slate-50/50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                 <span className="w-3 h-3 rounded-full bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)]" /> Hari Libur
              </div>
              <div className="flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                 <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]" /> Termin (Pambayaran)
              </div>
              <div className="flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                 <span className="w-3 h-3 rounded bg-emerald-500" /> <Flag className="w-2.5 h-2.5" /> Start
              </div>
              <div className="flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                 <span className="w-3 h-3 rounded bg-rose-500" /> <CheckCircle2 className="w-2.5 h-2.5" /> End
              </div>
           </div>
           <div className="text-slate-400 italic flex items-center gap-2">
              <Info className="w-3.5 h-3.5" />
              Termin 1-5 (20% - 100%) otomatis muncul setiap 7 hari dari tanggal mulai proyek.
           </div>
        </div>
      </div>
    </div>
  );
}
