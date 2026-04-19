import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  FileSpreadsheet, Plus, Trash2, Save, Calculator, 
  ChevronRight, Hash, Layers, Info, CheckCircle2, Box
} from 'lucide-react';
import Spinner from '../Spinner';
import ConversionCalculatorModal from '../ConversionCalculatorModal';
import SteelCalculationModal from '../SteelCalculationModal';
import IfcVolumeExtractor from './IfcVolumeExtractor';

export default function BackupVolumeTab({ 
  tabData, 
  projectId, 
  onRefresh,
  userSlotRole,
  isAdmin,
  isOwner,
  tabLoading,
  memberRole // 'normal' | 'pro' | 'advance' | 'admin'
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState({});
  const [status, setStatus] = useState(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [activeCalculatorRow, setActiveCalculatorRow] = useState(null);
  const [showSteelWizard, setShowSteelWizard] = useState(false);
  const [activeSteelLineId, setActiveSteelLineId] = useState(null);
  const [showIfcExtractor, setShowIfcExtractor] = useState(false);

  const editable = canEdit(userSlotRole, isAdmin, isOwner);

  // 1. Grouping Logic
  const sections = useMemo(() => {
    const items = tabData?.ahsp || [];
    const groups = [];
    items.forEach(it => {
      let group = groups.find(g => g.namaBab === it.bab_pekerjaan);
      if (!group) {
        group = { id: it.bab_pekerjaan || 'Tanpa Bab', namaBab: it.bab_pekerjaan || 'Tanpa Bab', lines: [] };
        groups.push(group);
      }
      group.lines.push(it);
    });
    return groups;
  }, [tabData?.ahsp]);

  const backupRecords = tabData?.backup || [];

  // 2. Data Handlers
  const handleAddRow = async (lineId) => {
    if (!editable) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('project_backup_volume').insert({
        project_id: projectId,
        line_id: lineId,
        uraian: `Segmen Baru`,
        p: 1, l: 1, t: 1, qty: 1, konversi: 1,
        total: 1
      });
      if (error) throw error;
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplySteel = async (results) => {
    if (!editable || !activeSteelLineId) return;
    setIsSaving(true);
    try {
      const payloads = results.map(r => ({
        project_id: projectId,
        line_id: activeSteelLineId,
        uraian: r.uraian,
        p: r.p,
        l: r.l,
        t: r.t,
        qty: r.qty,
        konversi: r.konversi,
        total: r.total
      }));

      const { error } = await supabase.from('project_backup_volume').insert(payloads);
      if (error) throw error;
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSaving(false);
      setShowSteelWizard(false);
    }
  };

  const handleUpdateRow = async (id, field, value, allLineRecords) => {
    if (!editable) return;
    const row = allLineRecords.find(r => r.id === id);
    if (!row) return;

    const nextRow = { ...row, [field]: value };
    const newTotal = (Number(nextRow.p) || 0) * 
                     (Number(nextRow.l) || 0) * 
                     (Number(nextRow.t) || 0) * 
                     (Number(nextRow.qty) || 0) * 
                     (Number(nextRow.konversi) || 0);

    try {
      const { error } = await supabase.from('project_backup_volume')
        .update({ [field]: value, total: newTotal })
        .eq('id', id);
      if (error) throw error;
      if (onRefresh) onRefresh(); 
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  const handleDeleteRow = async (id) => {
    if (!editable) return;
    if (!confirm('Hapus rincian ini?')) return;
    try {
      const { error } = await supabase.from('project_backup_volume').delete().eq('id', id);
      if (error) throw error;
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFinalize = async (lineId, grandTotal) => {
    if (!editable) return;
    setIsFinalizing(prev => ({ ...prev, [lineId]: true }));
    setStatus(null);
    try {
      const { error } = await supabase
        .from('ahsp_lines')
        .update({ volume: grandTotal })
        .eq('id', lineId);
        
      if (error) throw error;
      setStatus({ type: 'success', msg: 'Volume RAB diperbarui!' });
      if (onRefresh) onRefresh();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setIsFinalizing(prev => ({ ...prev, [lineId]: false }));
    }
  };

  if (tabLoading && (!tabData?.ahsp?.length)) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-400">
        <Spinner className="w-8 h-8" />
        <span className="text-[10px] font-black uppercase tracking-widest">Memuat Struktur RAB...</span>
      </div>
    );
  }

  return (
    <div className="p-2 lg:p-6 bg-slate-50 dark:bg-slate-900/50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Header Summary */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                 <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                 <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Backsheet Volume Pekerjaan</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Struktur otomatis sesuai RAB. {editable ? 'Anda memiliki izin mengedit.' : 'Mode Lihat Saja.'}</p>
              </div>
           </div>
           <div className="flex items-center gap-3">
              {(isAdmin || memberRole === 'advance') ? (
                <button
                  onClick={() => setShowIfcExtractor(true)}
                  className="px-4 py-2.5 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-orange-400 rounded-2xl hover:bg-indigo-100 dark:hover:bg-slate-700 transition-all shadow-sm flex items-center gap-2.5 font-black text-[10px] uppercase tracking-widest border border-indigo-100 dark:border-slate-800"
                >
                  <Box className="w-4 h-4" />
                  BIM IFC (Auto-Volume)
                </button>
              ) : (
                <div
                  title="Fitur ini eksklusif untuk paket Advance"
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center gap-2.5 font-black text-[10px] uppercase tracking-widest border border-slate-200 dark:border-slate-700 cursor-not-allowed select-none"
                >
                  <Box className="w-4 h-4" />
                  BIM IFC
                  <span className="ml-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-[8px] font-black">ADVANCE</span>
                </div>
              )}
              {status && (
                <div className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest animate-in fade-in duration-300 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                  {status.msg}
                </div>
              )}
           </div>
        </div>

        {/* Unified Table Content */}
        <div className="space-y-3">
           {sections.map((sec) => (
             <div key={sec.id} className="space-y-1">
                <div className="bg-slate-200/50 dark:bg-slate-800/50 px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                   <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">{sec.namaBab}</span>
                </div>

                <div className="space-y-3 pl-2 border-l-2 border-indigo-100 dark:border-slate-800 py-1">
                   {sec.lines.map(line => {
                      const records = backupRecords.filter(r => r.line_id === line.id);
                      const grandTotal = records.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
                      const isMatch = Math.abs(grandTotal - line.volume) < 0.001;

                      return (
                        <div key={line.id} className="bg-white dark:bg-slate-900 rounded-2xl border-[0.5px] border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-all hover:border-indigo-300 dark:hover:border-slate-600">
                           
                           <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between border-b-[0.5px] border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                 <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-slate-800 flex items-center justify-center text-indigo-600 dark:text-orange-500 text-[10px] font-black">
                                    {line.satuan}
                                 </div>
                                 <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate uppercase tracking-tight">{line.uraian_custom || line.uraian}</span>
                              </div>
                              
                              <div className="flex items-center gap-6 shrink-0 ml-4">
                                 <div className="flex flex-col items-end">
                                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Volume</span>
                                    <span className={`text-[12px] font-mono font-black ${isMatch ? 'text-emerald-500' : 'text-indigo-600 dark:text-orange-500'}`}>
                                       {grandTotal.toLocaleString('id-ID', { minimumFractionDigits: 3 })}
                                    </span>
                                 </div>
                                 
                                 <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => handleAddRow(line.id)}
                                      disabled={isSaving || !editable}
                                      className={`p-2 rounded-lg hover:scale-105 transition-all shadow-md active:scale-95 disabled:opacity-30 ${editable ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 text-slate-300'}`}
                                      title="Tambah Segmen Hitungan"
                                    >
                                       <Plus className="w-3 h-3" />
                                    </button>
                                    {editable && (
                                       <button 
                                          onClick={() => { setActiveSteelLineId(line.id); setShowSteelWizard(true); }}
                                          disabled={isSaving}
                                          className="p-2 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-orange-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-slate-700 transition-all shadow-sm flex items-center gap-1.5"
                                          title="Kalkulator Pembesian Pintar"
                                       >
                                          <Calculator className="w-3.5 h-3.5" />
                                          <span className="text-[8px] font-black uppercase">Wizard Besi</span>
                                       </button>
                                    )}
                                    <button 
                                      onClick={() => handleFinalize(line.id, grandTotal)}
                                      disabled={isFinalizing[line.id] || isMatch || !editable}
                                      className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all shadow-sm flex items-center gap-2 ${
                                        isMatch 
                                          ? 'bg-emerald-50 text-emerald-500 border border-emerald-100 cursor-default opacity-50' 
                                          : editable 
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
                                            : 'bg-slate-100 text-slate-300'
                                      }`}
                                    >
                                       {isFinalizing[line.id] ? <Spinner className="w-2.5 h-2.5" /> : (isMatch ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Save className="w-2.5 h-2.5" />)}
                                       {isFinalizing[line.id] ? '...' : (isMatch ? 'Match' : 'Finalisasi')}
                                    </button>
                                 </div>
                              </div>
                           </div>

                           <div className="overflow-x-auto">
                              <table className="w-full text-[10px] border-collapse">
                                 <thead>
                                    <tr className="bg-slate-50/30 dark:bg-slate-900/40 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b-[0.5px] border-slate-100 dark:border-slate-800">
                                       <th className="px-4 py-1.5 text-left font-bold">Deskripsi Segmen</th>
                                       <th className="px-2 py-1.5 text-center w-16">P</th>
                                       <th className="px-2 py-1.5 text-center w-16">L</th>
                                       <th className="px-2 py-1.5 text-center w-16">T</th>
                                       <th className="px-2 py-1.5 text-center w-16">Q</th>
                                       <th className="px-2 py-1.5 text-center w-16">K</th>
                                       <th className="px-4 py-1.5 text-right w-24">Total</th>
                                       <th className="px-4 py-1.5 text-right w-10"></th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y-[0.5px] divide-slate-100 dark:divide-slate-800/50">
                                    {records.length === 0 ? (
                                      <tr>
                                         <td colSpan="8" className="py-4 text-center text-slate-300 dark:text-slate-600 font-bold italic uppercase tracking-widest text-[8px]">Belum ada rincian data</td>
                                      </tr>
                                    ) : records.map(r => (
                                      <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 group">
                                         <td className="px-4 py-1.5">
                                            <input 
                                              value={r.uraian}
                                              disabled={!editable}
                                              onChange={e => handleUpdateRow(r.id, 'uraian', e.target.value, records)}
                                              placeholder="Nama Segmen..."
                                              className="w-full bg-transparent border-none p-0 focus:ring-0 font-bold text-slate-700 dark:text-slate-300 placeholder:text-slate-300 disabled:opacity-50"
                                            />
                                         </td>
                                         <td className="px-1 py-1"><InputSlim value={r.p} onChange={v => handleUpdateRow(r.id, 'p', v, records)} disabled={!editable} /></td>
                                         <td className="px-1 py-1"><InputSlim value={r.l} onChange={v => handleUpdateRow(r.id, 'l', v, records)} disabled={!editable} /></td>
                                         <td className="px-1 py-1"><InputSlim value={r.t} onChange={v => handleUpdateRow(r.id, 't', v, records)} disabled={!editable} /></td>
                                         <td className="px-1 py-1"><InputSlim value={r.qty} onChange={v => handleUpdateRow(r.id, 'qty', v, records)} disabled={!editable} /></td>
                                         <td className="px-1 py-1 relative group/k">
                                            <InputSlim value={r.konversi} onChange={v => handleUpdateRow(r.id, 'konversi', v, records)} disabled={!editable} />
                                            {editable && (
                                              <button 
                                                onClick={() => { setActiveCalculatorRow(r.id); setShowCalculator(true); }}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-white dark:bg-slate-700 rounded shadow-sm opacity-0 group-hover/k:opacity-100 transition-opacity text-indigo-600 dark:text-orange-400"
                                                title="Hitung Konversi"
                                              >
                                                <Calculator className="w-3 h-3" />
                                              </button>
                                            )}
                                         </td>
                                         <td className="px-4 py-1.5 text-right font-mono font-black text-slate-800 dark:text-slate-200">
                                            {Number(r.total || 0).toLocaleString('id-ID', { minimumFractionDigits: 3 })}
                                         </td>
                                         <td className="px-4 py-1.5 text-right">
                                            {editable && (
                                              <button 
                                                onClick={() => handleDeleteRow(r.id)}
                                                className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                              >
                                                 <Trash2 className="w-3 h-3" />
                                              </button>
                                            )}
                                         </td>
                                      </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        </div>
                      )
                   })}
                </div>
             </div>
           ))}
        </div>
      </div>

      <ConversionCalculatorModal 
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        onApply={(val) => {
          if (activeCalculatorRow) {
             const row = backupRecords.find(r => r.id === activeCalculatorRow);
             if (row) {
                handleUpdateRow(row.id, 'konversi', val, backupRecords);
             }
          }
          setShowCalculator(false);
        }}
        initialTitle="Konversi Volume Material"
      />

      <SteelCalculationModal 
        isOpen={showSteelWizard}
        onClose={() => setShowSteelWizard(false)}
        onApply={handleApplySteel}
      />

      {showIfcExtractor && (
        <IfcVolumeExtractor 
          onClose={() => setShowIfcExtractor(false)}
          projectId={projectId}
          ahspItems={tabData?.ahsp || []}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}

function InputSlim({ value, onChange, disabled }) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);

  return (
    <input 
      type="number"
      step="0.001"
      disabled={disabled}
      value={localVal === 0 ? '' : localVal}
      placeholder="1"
      onChange={e => {
        const v = e.target.value;
        setLocalVal(v);
        const parsed = parseFloat(v);
        if(!isNaN(parsed)) onChange(parsed);
        else if(v === '') onChange(1); 
      }}
      className="w-full bg-slate-100/50 dark:bg-slate-800/80 rounded-md border-0 py-1 px-1 text-center font-mono font-black text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-indigo-500/30 outline-none text-[9px] disabled:opacity-30"
    />
  );
}

function canEdit(role, isAdmin, isOwner) {
  return isAdmin || isOwner || role === 'kontraktor';
}
