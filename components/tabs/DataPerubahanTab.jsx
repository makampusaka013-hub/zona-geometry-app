import React, { useState, useMemo, useEffect } from 'react';
import Spinner from '../Spinner';
import { Activity, Save, AlertCircle, CheckCircle2, Search, Plus, Trash2, LayoutGrid, Box } from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

// ── COMPONENT: CcoSearch (Portable Version for Additions) ──
function CcoSearch({ onSelect, isSaving }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = React.useRef(null);

  useEffect(() => {
    if (!query || query.length < 2 || !open) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const searchPattern = `%${query.trim().replace(/\s+/g, '%')}%`;
        const { data, error } = await supabase.from('view_analisa_ahsp')
          .select('*')
          .or(`nama_pekerjaan.ilike.${searchPattern},kode_ahsp.ilike.${searchPattern}`)
          .order('urutan_prioritas', { ascending: true })
          .limit(10);
        if (!error) setResults(data || []);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <div className="relative w-full max-w-sm" ref={wrapperRef}>
      <div className="relative">
        <input 
          type="text" value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }}
          placeholder="Cari item pekerjaan tambah..."
          disabled={isSaving}
          className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-800 rounded-2xl px-10 py-3 text-[10px] font-bold outline-none focus:ring-2 ring-indigo-500/10 transition-all dark:text-white"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        {loading && <div className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin h-3.5 w-3.5 border-2 border-indigo-500 border-t-transparent rounded-full" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-[100] mt-2 w-full bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden divide-y divide-slate-50 dark:divide-slate-700 animate-in slide-in-from-top-2 duration-200">
          {results.map((it, idx) => (
            <div key={`${it.master_ahsp_id}-${idx}`} onClick={() => { onSelect(it); setOpen(false); setQuery(''); }}
              className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
              <div className="flex justify-between items-start mb-0.5">
                {/* Kode AHSP disembunyikan berdasarkan permintaan: hilangkan saja AN.xxx */}
                <span className="text-[7px] px-1 py-0.5 bg-slate-100 dark:bg-slate-900 rounded font-black text-slate-400 uppercase">{it.satuan_pekerjaan}</span>
              </div>
              <div className="text-[10px] font-bold text-slate-800 dark:text-white leading-tight">{it.nama_pekerjaan}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DataPerubahanTab({ 
  activeTab, 
  tabLoading, 
  tabData, 
  projectId, 
  onRefresh,
  userSlotRole,
  isAdmin,
  subTab,
  setSubTab,
  currentUserId
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  if (activeTab !== 'perubahan') return null;
  if (tabLoading) return <Spinner />;

  const items = tabData?.ahsp || [];
  const ccoData = tabData?.cco || [];
  const mcData = tabData?.mc || [];

  if (items.length === 0) {
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
    <div className="w-full h-full">

      {subTab === 'cco' ? (
        <CcoView 
          items={items} 
          ccoData={ccoData} 
          projectId={projectId} 
          onSaveStart={() => setIsSaving(true)}
          onSaveEnd={(res) => { setIsSaving(false); setSaveStatus(res); onRefresh(); }}
          isSaving={isSaving}
          userSlotRole={userSlotRole}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      ) : (
        <McView 
          items={items} 
          mcData={mcData} 
          projectId={projectId}
          onSaveStart={() => setIsSaving(true)}
          onSaveEnd={(res) => { setIsSaving(false); setSaveStatus(res); onRefresh(); }}
          isSaving={isSaving}
          userSlotRole={userSlotRole}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}

function CcoView({ items, ccoData, projectId, onSaveStart, onSaveEnd, isSaving, userSlotRole, isAdmin, currentUserId }) {
  const [localCco, setLocalCco] = useState({}); // { line_id: { volume, price, is_new } }
  const [ccoType, setCcoType] = useState('CCO-1');
  const [ccoStatus, setCcoStatus] = useState('draft');

  // 1. Compute Baseline (Patokan) locally - synchronous & instant
  const baseline = useMemo(() => {
    const currentVersionNumber = parseInt(ccoType.split('-')[1]) || 1;
    const prevVersion = currentVersionNumber > 1 ? `CCO-${currentVersionNumber - 1}` : null;

    const baseData = {};
    if (prevVersion) {
      ccoData
        .filter(c => c.cco_type === prevVersion && c.status === 'approved')
        .forEach(d => {
          baseData[d.line_id] = { volume: d.volume_cco, price: d.price_cco };
        });
    }

    const finalBase = {};
    items.forEach(it => {
      finalBase[it.id] = {
        volume: baseData[it.id]?.volume ?? it.volume,
        price: baseData[it.id]?.price ?? it.harga_satuan
      };
    });
    return finalBase;
  }, [ccoType, items, ccoData]);

  const ccoMetrics = useMemo(() => {
    let totBase = 0;
    let totNew = 0;
    let totTambah = 0;
    let totKurang = 0;

    items.forEach(it => {
      const base = baseline[it.id] || { volume: it.volume, price: it.harga_satuan };
      const current = localCco[it.id] || { volume: base.volume, price: base.price };
      
      const vBase = Number(base.volume) * Number(base.price);
      const vNew = Number(current.volume) * Number(current.price);
      const delta = vNew - vBase;

      totBase += vBase;
      totNew += vNew;
      if (delta > 0) totTambah += delta;
      else if (delta < 0) totKurang += Math.abs(delta);
    });

    return { totBase, totNew, totTambah, totKurang };
  }, [items, baseline, localCco]);

  useEffect(() => {
    // Filter drafts by current user, but include ALL approved records
    const currentDrafts = ccoData.filter(c => c.cco_type === ccoType && (c.status === 'approved' || c.created_by === currentUserId));
    const map = {};
    currentDrafts.forEach(c => {
      map[c.line_id] = { volume: c.volume_cco, price: c.price_cco };
    });
    setLocalCco(map);
    // Determine status based on current user's draft or approved status
    const myDraft = currentDrafts.find(c => c.created_by === currentUserId);
    const approvedOne = currentDrafts.find(c => c.status === 'approved');
    setCcoStatus(approvedOne ? 'approved' : (myDraft?.status || 'draft'));
  }, [ccoData, ccoType, currentUserId]);

  const handleAddItem = async (masterItem) => {
    onSaveStart();
    try {
      const { data: newLine, error: lineError } = await supabase.from('ahsp_lines').insert({
        project_id: projectId,
        master_ahsp_id: masterItem.master_ahsp_id,
        uraian: masterItem.nama_pekerjaan,
        satuan: masterItem.satuan_pekerjaan,
        volume: 0,
        harga_satuan: masterItem.total_subtotal || 0,
        jumlah: 0,
        bab_pekerjaan: 'PEKERJAAN TAMBAH',
        is_additional: true,
        sort_order: items.length + 1
      }).select().single();

      if (lineError) throw lineError;

      setLocalCco(prev => ({
        ...prev,
        [newLine.id]: { volume: 0, price: newLine.harga_satuan }
      }));

      onSaveEnd({ type: 'success', msg: `Pekerjaan '${masterItem.nama_pekerjaan}' berhasil ditambahkan ke usulan CCO.` });
    } catch (err) {
      onSaveEnd({ type: 'error', msg: err.message });
    }
  };

  const handleDeleteItem = async (lineId) => {
    const confirmed = await toast.confirm(
      'Hapus item pekerjaan tambah ini?',
      'Tindakan ini tidak dapat dibatalkan. Item akan dihapus permanen dari usulan CCO.'
    );
    if (!confirmed) return;
    onSaveStart();
    try {
      const { error } = await supabase.from('ahsp_lines').delete().eq('id', lineId).eq('is_additional', true);
      if (error) throw error;
      onSaveEnd({ type: 'success', msg: 'Item pekerjaan tambah berhasil dihapus.' });
    } catch (err) {
      onSaveEnd({ type: 'error', msg: err.message });
    }
  };

  const handleSave = async (status = 'draft') => {
    onSaveStart();
    try {
      const payload = Object.entries(localCco).map(([line_id, data]) => {
        const base = baseline[line_id] || { volume: 0, price: 0 };
        return {
          project_id: projectId,
          line_id,
          cco_type: ccoType,
          status,
          volume_orig: base.volume,
          price_orig: base.price,
          volume_cco: Number(data.volume),
          price_cco: Number(data.price),
          jumlah_cco: Number(data.volume) * Number(data.price),
          created_by: currentUserId,
          updated_at: new Date().toISOString()
        };
      });

      if (payload.length === 0) throw new Error("Tidak ada perubahan untuk disimpan.");
      const { error } = await supabase.from('project_cco').upsert(payload, { 
        onConflict: 'project_id,cco_type,line_id,created_by' 
      });
      if (error) throw error;
      
      const actionMsg = status === 'approved' ? 'disetujui' : 'disimpan sebagai draf';
      onSaveEnd({ type: 'success', msg: `Data ${ccoType} berhasil ${actionMsg}.` });
    } catch (err) {
      onSaveEnd({ type: 'error', msg: err.message });
    }
  };

  const isApproved = ccoStatus === 'approved';
  const canEdit = !isApproved && (isAdmin || userSlotRole === 'kontraktor');
  const canApprove = !isApproved && (isAdmin || userSlotRole === 'konsultan' || userSlotRole === 'instansi');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-2">
        <div className="bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-5 rounded-3xl shadow-sm">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Kontrak / Prev</div>
          <div className="text-sm font-black text-slate-800 dark:text-white font-mono">Rp{ccoMetrics.totBase.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-emerald-500/5 dark:bg-emerald-500/10 backdrop-blur-xl border border-emerald-500/20 p-5 rounded-3xl shadow-sm">
          <div className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-3">Pekerjaan Tambah (+)</div>
          <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">+{ccoMetrics.totTambah.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-red-500/5 dark:bg-red-500/10 backdrop-blur-xl border border-red-500/20 p-5 rounded-3xl shadow-sm">
          <div className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em] mb-3">Pekerjaan Kurang (-)</div>
          <div className="text-sm font-black text-red-600 dark:text-red-400 font-mono">-{ccoMetrics.totKurang.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-indigo-600 dark:bg-indigo-500/20 backdrop-blur-xl border border-indigo-500/20 p-5 rounded-3xl shadow-lg shadow-indigo-500/10">
          <div className="text-[9px] font-black text-indigo-200 dark:text-indigo-300 uppercase tracking-[0.2em] mb-3">Estimasi Kontrak Baru</div>
          <div className="text-sm font-black text-white font-mono">Rp{ccoMetrics.totNew.toLocaleString('id-ID')}</div>
        </div>
      </div>

      <div className="flex items-center justify-between px-2 pt-2">
        <div className="flex items-center gap-4">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revisi CCO:</label>
          <select value={ccoType} onChange={e => setCcoType(e.target.value)}
            className="bg-transparent border-0 text-xs font-black text-indigo-600 dark:text-orange-500 focus:ring-0 cursor-pointer">
            {['CCO-1', 'CCO-2', 'CCO-3', 'CCO-4', 'CCO-5'].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${isApproved ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
            {isApproved ? '✓ APPROVED' : '⚡ DRAFT'}
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-4">
             <CcoSearch onSelect={handleAddItem} isSaving={isSaving} />
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#020617] shadow-2xl overflow-hidden relative">
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 relative">
          <table className="w-full text-sm border-separate border-spacing-0 min-w-[1000px]">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[8px] uppercase font-black tracking-widest shadow-sm">
                <th className="px-4 py-4 text-left border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 min-w-[200px]" rowSpan={2}>Uraian Pekerjaan</th>
                <th className="px-4 py-4 text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50" colSpan={3}>KONTRAK / PATOKAN SEBELUMNYA</th>
                <th className="px-4 py-4 text-center border-b border-slate-200 dark:border-slate-800 bg-indigo-50/30 dark:bg-indigo-900/10" colSpan={3}>USULAN {ccoType}</th>
                <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 w-[140px]" rowSpan={2}>Selisih (+/-)</th>
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 text-[8px] font-bold tracking-tight">
                <th className="px-4 py-2 text-right border-b border-slate-200 dark:border-slate-800 border-l border-slate-100 dark:border-slate-800">Vol</th>
                <th className="px-4 py-2 text-right border-b border-slate-200 dark:border-slate-800">Harga</th>
                <th className="px-4 py-2 text-right border-b border-slate-200 dark:border-slate-800 font-black text-slate-800 dark:text-white">Jumlah</th>
                <th className="px-4 py-2 text-right border-b border-indigo-200/30 dark:border-indigo-800/30 border-l border-indigo-100/30">Vol Baru</th>
                <th className="px-4 py-2 text-right border-b border-indigo-200/30 dark:border-indigo-800/30">Harga Baru</th>
                <th className="px-4 py-2 text-right border-b border-indigo-200/30 dark:border-indigo-800/30 font-black text-slate-800 dark:text-white">Jumlah Baru</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {items.map(it => {
                const base = baseline[it.id] || { volume: it.volume, price: it.harga_satuan };
                const current = localCco[it.id] || { volume: base.volume, price: base.price };
                const volDelta = Number(current.volume) - Number(base.volume);
                const priceDelta = Number(current.price) - Number(base.price);
                const jumlahDelta = (Number(current.volume) * Number(current.price)) - (Number(base.volume) * Number(base.price));
                const hasChange = volDelta !== 0 || priceDelta !== 0;
                const isExpansion = jumlahDelta > 0;
                const isReduction = jumlahDelta < 0;

                return (
                  <tr key={it.id} className={`transition-all group ${hasChange ? (isExpansion ? 'bg-amber-500/5 dark:bg-amber-500/5' : 'bg-red-500/5 dark:bg-red-500/5') : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/40'}`}>
                    <td className="px-4 py-4 relative">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="text-[8px] text-slate-400 font-black uppercase tracking-widest">{it.bab_pekerjaan}</div>
                        {it.is_additional && (
                          <span className="bg-indigo-500 text-white text-[7px] font-black px-1 py-0.5 rounded shadow-lg shadow-indigo-500/20">TAMBAH</span>
                        )}
                      </div>
                      <div className="font-bold text-slate-800 dark:text-white text-[11px] leading-tight flex items-center gap-2">
                        {it.uraian_custom || it.uraian}
                        {it.is_additional && canEdit && (
                          <button onClick={() => handleDeleteItem(it.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="text-[9px] text-slate-400 mt-1 uppercase font-bold opacity-50 font-mono">{it.satuan}</div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[10px] font-bold text-slate-400">{Number(base.volume).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-4 text-right font-mono text-[10px] font-bold text-slate-400">{Number(base.price).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-4 text-right font-mono text-[10px] font-black text-slate-600 dark:text-slate-400">{(Number(base.volume) * Number(base.price)).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-4 bg-indigo-50/20 dark:bg-indigo-900/5">
                      <input type="number" value={current.volume} disabled={!canEdit}
                        onChange={e => setLocalCco({ ...localCco, [it.id]: { ...current, volume: e.target.value } })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg px-2 py-1.5 text-right font-mono text-[10px] font-black outline-none focus:ring-2 ring-indigo-500/20 disabled:opacity-50" />
                    </td>
                    <td className="px-4 py-4 bg-indigo-50/20 dark:bg-indigo-900/5">
                      <input type="number" value={current.price} disabled={!canEdit}
                        onChange={e => setLocalCco({ ...localCco, [it.id]: { ...current, price: e.target.value } })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg px-2 py-1.5 text-right font-mono text-[10px] font-black outline-none focus:ring-2 ring-indigo-500/20 disabled:opacity-50" />
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[10px] font-black text-indigo-700 dark:text-indigo-400 bg-indigo-50/10 dark:bg-indigo-900/5">{(Number(current.volume) * Number(current.price)).toLocaleString('id-ID')}</td>
                    <td className={`px-4 py-4 text-right font-mono text-[10px] font-black ${jumlahDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : jumlahDelta < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-300'}`}>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[8px] opacity-70">
                          {volDelta !== 0 && `${volDelta > 0 ? '+' : ''}${Number(volDelta).toLocaleString('id-ID')} Vol`}
                        </span>
                        <span>{jumlahDelta > 0 ? '+' : ''}{Number(jumlahDelta).toLocaleString('id-ID')}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Grand Total Row */}
              <tr className="bg-slate-100/50 dark:bg-slate-900/80 font-black">
                <td className="px-4 py-6 text-[10px] uppercase tracking-widest text-slate-500">Grand Total Pekerjaan</td>
                <td className="px-4 py-6" colSpan={2}></td>
                <td className="px-4 py-6 text-right font-mono text-[11px] text-slate-800 dark:text-white">Rp{ccoMetrics.totBase.toLocaleString('id-ID')}</td>
                <td className="px-4 py-6" colSpan={2}></td>
                <td className="px-4 py-6 text-right font-mono text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-900/20">Rp{ccoMetrics.totNew.toLocaleString('id-ID')}</td>
                <td className={`px-4 py-6 text-right font-mono text-[11px] ${ccoMetrics.totNew - ccoMetrics.totBase > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {(ccoMetrics.totNew - ccoMetrics.totBase).toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Glow Amber = Penambahan Biaya | Glow Red = Pengurangan Biaya</span>
          </div>
          <div className="flex items-center gap-3">
            {canEdit && (
              <button onClick={() => handleSave('draft')} disabled={isSaving}
                className="flex items-center justify-center gap-2 min-w-[160px] bg-slate-800 dark:bg-slate-700 hover:bg-black text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all">
                {isSaving ? <div className="w-3 h-3 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <Save className="w-3 h-3" />} SIMPAN DRAF
              </button>
            )}
            {canApprove && (
              <button onClick={() => handleSave('approved')} disabled={isSaving}
                className="flex items-center justify-center gap-2 min-w-[160px] bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                {isSaving ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <CheckCircle2 className="w-4 h-4" />} APPROVE {ccoType}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function McView({ items, mcData, projectId, onSaveStart, onSaveEnd, isSaving, userSlotRole, isAdmin, currentUserId }) {
  const [localMc, setLocalMc] = useState({}); // { line_id: volume_mc }
  const [mcType, setMcType] = useState('MC-0');

  const mcMetrics = useMemo(() => {
    let totMc = 0;
    items.forEach(it => {
      const val = localMc[it.id] ?? 0;
      totMc += Number(val) * Number(it.harga_satuan);
    });
    return { totMc };
  }, [items, localMc]);

  useEffect(() => {
    const map = {};
    mcData.filter(m => m.mc_type === mcType && m.created_by === currentUserId).forEach(m => { map[m.line_id] = m.volume_mc; });
    setLocalMc(map);
  }, [mcData, mcType, currentUserId]);

  const handleSave = async () => {
    onSaveStart();
    try {
      const payload = Object.entries(localMc).map(([line_id, volume_mc]) => ({
        project_id: projectId,
        line_id,
        mc_type: mcType,
        volume_mc: Number(volume_mc),
        created_by: currentUserId,
        updated_at: new Date().toISOString()
      }));

      if (payload.length === 0) throw new Error("Tidak ada data progres untuk disimpan.");

      const { error } = await supabase.from('project_mc').upsert(payload, {
        onConflict: 'project_id,mc_type,line_id,created_by'
      });
      if (error) throw error;
      onSaveEnd({ type: 'success', msg: `Data ${mcType} berhasil disimpan secara permanen.` });
    } catch (err) {
      onSaveEnd({ type: 'error', msg: err.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-2">
        <div className="bg-indigo-600 dark:bg-indigo-500/20 backdrop-blur-xl border border-indigo-500/20 p-5 rounded-3xl shadow-lg shadow-indigo-500/10">
          <div className="text-[9px] font-black text-indigo-200 dark:text-indigo-300 uppercase tracking-[0.2em] mb-3">Total Nilai {mcType}</div>
          <div className="text-sm font-black text-white font-mono">Rp{mcMetrics.totMc.toLocaleString('id-ID')}</div>
        </div>
        <div className="bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-5 rounded-3xl opacity-50 select-none">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Target Progress</div>
          <div className="text-sm font-black text-slate-800 dark:text-white font-mono">{mcType === 'MC-100' ? '100%' : mcType === 'MC-50' ? '50%' : '0%'}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 px-2 pt-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jenis Mutual Check:</label>
        <select value={mcType} onChange={e => setMcType(e.target.value)}
          className="bg-transparent border-0 text-xs font-black text-amber-600 dark:text-amber-500 focus:ring-0 cursor-pointer">
          <option value="MC-0">MC-0 (Baseline Lapangan)</option>
          <option value="MC-50">MC-50 (Progres Pertengahan)</option>
          <option value="MC-100">MC-100 (Final Check)</option>
        </select>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#020617] shadow-2xl overflow-hidden relative">
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 relative">
          <table className="w-full text-sm border-separate border-spacing-0 min-w-[1000px]">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[9px] uppercase font-black tracking-widest shadow-sm">
                <th className="px-6 py-4 text-left border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900 min-w-[200px]">URAIAN PEKERJAAN</th>
                <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">VOL. KONTRAK</th>
                <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">HARGA SATUAN</th>
                <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900 w-32">VOL. {mcType}</th>
                <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900">JUMLAH {mcType}</th>
                <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100 dark:bg-slate-900 w-32">SELISIH (+/-)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {items.map(it => {
                const val = localMc[it.id] ?? 0;
                const volDelta = Number(val) - Number(it.volume);
                const jumlahMc = Number(val) * Number(it.harga_satuan);
                const jumlahKontrak = Number(it.volume) * Number(it.harga_satuan);
                const deltaTotal = jumlahMc - jumlahKontrak;

                return (
                  <tr key={it.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors group">
                    <td className="px-6 py-6 border-b border-slate-50 dark:border-slate-800/50">
                      <div className="text-[9px] text-indigo-600 dark:text-orange-400 font-black uppercase tracking-widest mb-1">{it.bab_pekerjaan}</div>
                      <div className="font-bold text-slate-800 dark:text-white text-[11px] tracking-tight">{it.uraian_custom || it.uraian}</div>
                      <div className="text-[10px] text-slate-400 mt-1 uppercase font-bold opacity-60 font-mono">{it.satuan}</div>
                    </td>
                    <td className="px-4 py-6 text-right font-mono text-[10px] font-bold text-slate-400 border-b border-slate-50 dark:border-slate-800/50">{Number(it.volume).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-6 text-right font-mono text-[10px] font-bold text-slate-400 border-b border-slate-50 dark:border-slate-800/50">{Number(it.harga_satuan).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-6 text-right border-b border-slate-50 dark:border-slate-800/50">
                      <input 
                        type="number" 
                        value={val}
                        disabled={it.status_approval === 'final' || (!isAdmin && userSlotRole !== 'kontraktor')}
                        onChange={e => setLocalMc({ ...localMc, [it.id]: e.target.value })}
                        className="w-full bg-amber-500/5 dark:bg-amber-500/5 border border-amber-500/20 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 rounded-xl px-2 py-2 text-right font-mono text-[10px] font-black text-amber-600 dark:text-amber-400 transition-all outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-6 text-right font-mono text-[10px] font-black text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-white/5 border-b border-slate-50 dark:border-slate-800/50">
                      {jumlahMc.toLocaleString('id-ID')}
                    </td>
                    <td className={`px-4 py-6 text-right border-b border-slate-50 dark:border-slate-800/50 font-mono text-[10px] font-black ${deltaTotal > 0 ? 'text-emerald-600' : deltaTotal < 0 ? 'text-red-500' : 'text-slate-300'}`}>
                      <div className="flex flex-col items-end gap-0.5">
                         <span className="text-[8px] opacity-70">
                           {volDelta !== 0 && `${volDelta > 0 ? '+' : ''}${Number(volDelta).toLocaleString('id-ID')} Vol`}
                         </span>
                         <span>{deltaTotal > 0 ? '+' : ''}{Number(deltaTotal).toLocaleString('id-ID')}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Grand Total Row MC */}
              <tr className="bg-slate-100/50 dark:bg-slate-900/80 font-black">
                <td className="px-6 py-6 text-[10px] uppercase tracking-widest text-slate-500">Grand Total Progres {mcType}</td>
                <td colSpan={3}></td>
                <td className="px-4 py-6 text-right font-mono text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-900/20">
                  Rp{mcMetrics.totMc.toLocaleString('id-ID')}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          {(isAdmin || userSlotRole === 'kontraktor') && (
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 min-w-[200px] bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white px-8 py-3 rounded-2xl font-black text-xs shadow-xl shadow-indigo-500/20 dark:shadow-none disabled:opacity-50 transition-all"
            >
              {isSaving ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'MENYIMPAN...' : `SIMPAN DATA ${mcType}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
