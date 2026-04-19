'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { toast } from '@/lib/toast';

function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

// Inline editable harga cell — only renders input for admin/pro (custom rows)
function InlineHargaCell({ rowId, hargaSatuan, isEditable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(e) {
    e.stopPropagation();
    setVal(String(Math.round(hargaSatuan || 0)));
    setEditing(true);
  }

  async function commit(e) {
    e?.stopPropagation();
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) { setEditing(false); return; }
    setSaving(true);
    await onSave(rowId, num);
    setSaving(false);
    setEditing(false);
  }

  function cancel(e) {
    e?.stopPropagation();
    setEditing(false);
  }

  if (!isEditable) {
    return (
      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
        {formatIdr(hargaSatuan)}
      </td>
    );
  }

  if (!editing) {
    return (
      <td
        className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-700 dark:hover:text-orange-400 group transition-colors"
        title="Klik untuk edit harga satuan"
        onClick={startEdit}
      >
        <span className="inline-flex items-center gap-1">
          {formatIdr(hargaSatuan)}
          <svg className="w-3 h-3 text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </span>
      </td>
    );
  }

  return (
    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-end gap-1">
        <input
          autoFocus
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(e); if (e.key === 'Escape') cancel(e); }}
          className="w-32 text-xs font-mono text-right border border-orange-400 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-100"
        />
        <button onClick={commit} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold px-2 py-1.5 rounded disabled:opacity-50 transition-colors" title="Simpan">
          {saving ? '…' : '✓'}
        </button>
        <button onClick={cancel} className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[10px] px-2 py-1.5 rounded transition-colors" title="Batal">✕</button>
      </div>
    </td>
  );
}

// Inline editable TKDN cell
function InlineTkdnCell({ rowId, tkdnPercent, isEditable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(e) {
    e.stopPropagation();
    setVal(String(Number(tkdnPercent || 0).toFixed(2)));
    setEditing(true);
  }

  async function commit(e) {
    e?.stopPropagation();
    const num = parseFloat(val);
    if (isNaN(num) || num < 0 || num > 100) { 
      toast.warning('TKDN harus antara 0 - 100'); 
      setEditing(false); 
      return; 
    }
    setSaving(true);
    await onSave(rowId, num);
    setSaving(false);
    setEditing(false);
  }

  function cancel(e) {
    e?.stopPropagation();
    setEditing(false);
  }

  if (!isEditable) {
    return (
      <td className="px-3 py-3 text-center font-mono text-xs text-green-700 dark:text-green-400">
        {tkdnPercent !== undefined && tkdnPercent !== null ? Number(tkdnPercent).toFixed(2) + '%' : '-'}
      </td>
    );
  }

  if (!editing) {
    return (
      <td
        className="px-3 py-3 text-center font-mono text-xs text-green-700 dark:text-green-400 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-800 dark:hover:text-green-300 group transition-colors"
        title="Klik untuk edit TKDN"
        onClick={startEdit}
      >
        <span className="inline-flex items-center gap-1">
          {tkdnPercent !== undefined && tkdnPercent !== null ? Number(tkdnPercent).toFixed(2) + '%' : '-'}
          <svg className="w-3 h-3 text-green-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </span>
      </td>
    );
  }

  return (
    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-center gap-1">
        <input
          autoFocus
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(e); if (e.key === 'Escape') cancel(e); }}
          className="w-16 text-xs font-mono text-center border border-green-400 rounded px-1 flex-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 bg-green-50 dark:bg-green-900/20 dark:text-green-100"
        />
        <button onClick={commit} disabled={saving} className="bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold px-1.5 py-1.5 rounded disabled:opacity-50 transition-colors">
          {saving ? '…' : '✓'}
        </button>
        <button onClick={cancel} className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[10px] px-1.5 py-1.5 rounded transition-colors">✕</button>
      </div>
    </td>
  );
}

// Modal Override Harga PUPR → untuk user Pro/Admin
// Membuat harga custom yang terhubung ke item PUPR tertentu (overrides_harga_dasar_id)
// Sehingga AHSP view otomatis pakai harga ini milik user, bukan PUPR default.
function ModalOverrideHarga({ puprRow, onClose, onSaved }) {
  const [form, setForm] = useState({
    harga_satuan: String(Math.round(puprRow?.harga_satuan || 0)),
    tkdn_percent: String(Number(puprRow?.tkdn_percent || 0).toFixed(2)),
    satuan: puprRow?.satuan || '',
    nama_item: puprRow?.nama_item || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [existingId, setExistingId] = useState(null);

  // Cek apakah user sudah punya override untuk item ini
  useEffect(() => {
    if (!puprRow?.id) return;
    supabase
      .from('master_harga_custom')
      .select('id, harga_satuan, tkdn_percent')
      .eq('overrides_harga_dasar_id', puprRow.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          setForm(prev => ({
            ...prev,
            harga_satuan: String(Math.round(data.harga_satuan || 0)),
            tkdn_percent: String(Number(data.tkdn_percent || 0).toFixed(2)),
          }));
        }
      });
  }, [puprRow?.id]);

  function setField(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function handleSave() {
    const harga = parseFloat(form.harga_satuan);
    if (isNaN(harga) || harga < 0) { setErr('Harga tidak valid.'); return; }
    const tkdn = parseFloat(form.tkdn_percent);
    if (isNaN(tkdn) || tkdn < 0 || tkdn > 100) { setErr('TKDN harus 0–100.'); return; }

    setSaving(true); setErr('');

    const prefix = puprRow?.kode_item
      ? { 'L': 'Upah', 'M': 'Alat', 'C': 'Lumpsum' }[puprRow.kode_item[0]?.toUpperCase()] || 'Bahan'
      : 'Bahan';

    const payload = {
      nama_item: form.nama_item.trim(),
      satuan: form.satuan.trim(),
      harga_satuan: harga,
      tkdn_percent: tkdn,
      kategori_item: prefix,
      overrides_harga_dasar_id: puprRow.id,
    };

    let error;
    if (existingId) {
      // Update override yang sudah ada
      ({ error } = await supabase.from('master_harga_custom').update(payload).eq('id', existingId));
    } else {
      // Buat override baru
      ({ error } = await supabase.from('master_harga_custom').insert(payload));
    }

    setSaving(false);
    if (error) { setErr('Gagal: ' + error.message); return; }
    onSaved();
  }

  async function handleRemove() {
    if (!existingId) return;
    const confirmed = await toast.confirm(
      'Hapus override ini?',
      'AHSP akan kembali menggunakan harga standar PUPR.'
    );
    if (!confirmed) return;
    const { error } = await supabase.from('master_harga_custom').delete().eq('id', existingId);
    if (error) { toast.error('Gagal hapus: ' + error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {existingId ? '✏️ Edit Override Harga' : '🔧 Set Override Harga'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[240px]">
              {puprRow?.nama_item}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Info PUPR */}
        <div className="mx-5 mt-4 px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex justify-between"><span>Harga PUPR:</span><span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{formatIdr(puprRow?.harga_satuan)}</span></div>
          <div className="flex justify-between mt-0.5"><span>TKDN PUPR:</span><span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{Number(puprRow?.tkdn_percent || 0).toFixed(2)}%</span></div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Harga Override (Anda) *</label>
            <input
              type="number"
              value={form.harga_satuan}
              onChange={e => setField('harga_satuan', e.target.value)}
              className="w-full text-sm font-mono border border-indigo-300 dark:border-orange-600 rounded-lg px-3 py-2 bg-indigo-50 dark:bg-orange-900/20 text-indigo-800 dark:text-orange-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">TKDN Override % (0–100)</label>
            <input
              type="number" step="0.01" min="0" max="100"
              value={form.tkdn_percent}
              onChange={e => setField('tkdn_percent', e.target.value)}
              className="w-full text-sm font-mono border border-green-300 dark:border-green-600 rounded-lg px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            ℹ️ Harga ini akan <strong>otomatis diterapkan</strong> ke seluruh AHSP yang menggunakan item ini. User lain tidak terpengaruh.
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          {existingId && (
            <button onClick={handleRemove} title="Hapus override, kembali ke PUPR"
              className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              🗑️ Hapus
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Batal</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            {saving ? 'Menyimpan...' : existingId ? '✓ Update' : '✓ Set Override'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal Tambah Harga Custom
function ModalTambahCustom({ onClose, onSaved }) {
  const [form, setForm] = useState({
    nama_item: '',
    satuan: '',
    harga_satuan: '',
    tkdn_percent: '0',
    kategori_item: 'Bahan',
    kode_item: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [loadingKode, setLoadingKode] = useState(false);

  // Prefix per kategori
  const KATEGORI_PREFIX = { Bahan: 'A', Upah: 'L', Alat: 'M', Lumpsum: 'LS' };

  // Auto-generate kode item berdasarkan kategori & data existing
  async function generateKode(kategori) {
    const prefix = KATEGORI_PREFIX[kategori] || 'X';
    setLoadingKode(true);
    
    // Ambil data existing untuk menentukan nomor berikutnya
    const { data } = await supabase
      .from('master_harga_custom')
      .select('kode_item')
      .ilike('kode_item', `${prefix}${kategori === 'Lumpsum' ? '.' : '.C'}%`);

    let maxNum = 0;
    if (data && data.length > 0) {
      data.forEach(r => {
        if (!r.kode_item) return;
        // Ambil angka terakhir dari kode (setelah titik dan opsional huruf C)
        const match = r.kode_item.match(/\.(?:C)?(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
    }
    const nextNum = String(maxNum + 1).padStart(3, '0');
    setLoadingKode(false);
    
    // Format: LS.001 untuk Lumpsum, A.C001 untuk lainnya
    return kategori === 'Lumpsum' ? `${prefix}.${nextNum}` : `${prefix}.C${nextNum}`;
  }

  // Generate kode saat modal pertama kali dibuka (default 'Bahan' → 'A.001')
  useEffect(() => {
    generateKode('Bahan').then(kode => setForm(prev => ({ ...prev, kode_item: kode })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-generate kode saat user mengganti kategori
  async function handleKategoriChange(newKat) {
    setForm(prev => ({ ...prev, kategori_item: newKat }));
    const kode = await generateKode(newKat);
    setForm(prev => ({ ...prev, kategori_item: newKat, kode_item: kode }));
  }

  function setField(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function handleSave() {
    if (!form.nama_item.trim()) { setErr('Nama Item wajib diisi.'); return; }
    if (!form.satuan.trim()) { setErr('Satuan wajib diisi.'); return; }
    const harga = parseFloat(form.harga_satuan);
    if (isNaN(harga) || harga < 0) { setErr('Harga Satuan tidak valid.'); return; }
    const tkdn = parseFloat(form.tkdn_percent);
    if (isNaN(tkdn) || tkdn < 0 || tkdn > 100) { setErr('TKDN harus antara 0–100.'); return; }

    setSaving(true);
    setErr('');
    const { error } = await supabase.from('master_harga_custom').insert({
      nama_item: form.nama_item.trim(),
      satuan: form.satuan.trim(),
      harga_satuan: harga,
      tkdn_percent: tkdn,
      kategori_item: form.kategori_item,
      kode_item: form.kode_item.trim() || null,
    });
    setSaving(false);
    if (error) { setErr('Gagal menyimpan: ' + error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Tambah Harga Custom</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Data hanya terlihat oleh Anda sendiri</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="text-xs text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Item *</label>
              <input
                type="text"
                value={form.nama_item}
                onChange={e => setField('nama_item', e.target.value)}
                placeholder="cth: Cat Jotun Premium 5L"
                className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kategori *</label>
              <select
                value={form.kategori_item}
                onChange={e => handleKategoriChange(e.target.value)}
                className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Bahan">Bahan</option>
                <option value="Upah">Upah</option>
                <option value="Alat">Alat</option>
                <option value="Lumpsum">Lumpsum</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kode Item
                <span className="ml-1 font-normal text-indigo-500 dark:text-indigo-400">(otomatis)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loadingKode ? '...' : form.kode_item}
                  onChange={e => setField('kode_item', e.target.value)}
                  placeholder="A.001"
                  className="w-full text-sm font-mono border border-indigo-300 dark:border-orange-600 rounded-lg px-3 py-2 bg-indigo-50 dark:bg-orange-900/20 text-indigo-800 dark:text-orange-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500"
                />
                {loadingKode && (
                  <div className="absolute right-2 top-2.5">
                    <svg className="animate-spin w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                )}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Bahan=A, Upah=L, Alat=M, Lumpsum=C — Format: PREFIX.CNNN. Bisa diubah manual.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Satuan *</label>
              <input
                type="text"
                value={form.satuan}
                onChange={e => setField('satuan', e.target.value)}
                placeholder="cth: kg, m3, OH"
                className="w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Harga Satuan *</label>
              <input
                type="number"
                value={form.harga_satuan}
                onChange={e => setField('harga_satuan', e.target.value)}
                placeholder="0"
                className="w-full text-sm font-mono border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">TKDN % (0–100)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.tkdn_percent}
                onChange={e => setField('tkdn_percent', e.target.value)}
                placeholder="0"
                className="w-full text-sm font-mono border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingKode}
            className="flex-1 py-2 rounded-lg bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? 'Menyimpan...' : '+ Tambah'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KatalogHargaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [memberRole, setMemberRole] = useState('view');
  const [currentUserId, setCurrentUserId] = useState(null);
  const isCheckingAuth = React.useRef(false);

  // Data
  const [data, setData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [customCount, setCustomCount] = useState(0);

  // UI State
  const [query, setQuery] = useState('');
  const [kategoriFilter, setKategoriFilter] = useState('');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [overrideRow, setOverrideRow] = useState(null); // PUPR row yang akan di-override

  const isAdmin = memberRole === 'admin';
  const isPro = memberRole === 'pro';
  const isNormal = memberRole === 'normal';
  const canAddCustom = isAdmin || isPro || isNormal;

  const checkAuth = useCallback(async () => {
    if (isCheckingAuth.current) return;
    isCheckingAuth.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.replace('/login'); return; }
      setCurrentUserId(user.id);
      const { data: m } = await supabase.from('members').select('role').eq('user_id', user.id).maybeSingle();
      setMemberRole(m?.role || 'view');
    } finally {
      isCheckingAuth.current = false;
    }
  }, [router]);

  const loadStats = useCallback(async () => {
    const { count } = await supabase.from('master_harga_dasar').select('*', { count: 'exact', head: true });
    setTotalCount(count || 0);
    if (currentUserId) {
      const { count: cc } = await supabase.from('master_harga_custom').select('*', { count: 'exact', head: true });
      setCustomCount(cc || 0);
    }
  }, [currentUserId]);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Query gabungan: custom (priority=1) UNION resmi (priority=2),
    // disaring via view_master_harga_gabungan
    let q = supabase.from('view_master_harga_gabungan').select('*');

    if (query) {
      q = q.or(`nama_item.ilike.%${query}%,kode_item.ilike.%${query}%`);
    }

    if (kategoriFilter) {
      q = q.eq('kategori_item', kategoriFilter);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    // Sort: custom items dulu (urutan_prioritas=1), lalu resmi, lalu by nama
    q = q.order('urutan_prioritas', { ascending: true }).order('nama_item', { ascending: true }).range(from, to);

    const { data: rows, error } = await q;

    if (error) {
      setErrorMsg(error.message);
      setData([]);
    } else {
      setErrorMsg('');
      setData(rows || []);
    }
    setLoading(false);
  }, [page, limit, query, kategoriFilter]);

  useEffect(() => {
    checkAuth().then(() => {
      loadStats();
      loadData();
    });
  }, [checkAuth, loadStats, loadData]);

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }

  async function handleSaveHarga(rowId, newHarga) {
    // Tentukan tabel sumber berdasarkan data baris
    const row = data.find(r => r.id === rowId);
    const tabel = row?.source_table || 'master_harga_dasar';

    const { error } = await supabase.from(tabel).update({ harga_satuan: newHarga }).eq('id', rowId);
    if (error) { toast.error('Gagal menyimpan: ' + error.message); return; }
    showToast('✅ Harga berhasil diperbarui!');
    setData(prev => prev.map(r => r.id === rowId ? { ...r, harga_satuan: newHarga } : r));
  }

  async function handleSaveTkdn(rowId, newTkdn) {
    const row = data.find(r => r.id === rowId);
    const tabel = row?.source_table || 'master_harga_dasar';

    const { error } = await supabase.from(tabel).update({ tkdn_percent: newTkdn }).eq('id', rowId);
    if (error) { toast.error('Gagal menyimpan TKDN: ' + error.message); return; }
    showToast('✅ TKDN berhasil diperbarui!');
    setData(prev => prev.map(r => r.id === rowId ? { ...r, tkdn_percent: newTkdn } : r));
  }

  async function handleDeleteCustom(rowId) {
    const confirmed = await toast.confirm('Hapus item custom ini?', 'Data ini akan dihapus permanen dari katalog Anda.');
    if (!confirmed) return;
    const { error } = await supabase.from('master_harga_custom').delete().eq('id', rowId);
    if (error) { toast.error('Gagal hapus: ' + error.message); return; }
    showToast('🗑️ Item custom berhasil dihapus.');
    setData(prev => prev.filter(r => r.id !== rowId));
    setCustomCount(prev => Math.max(0, prev - 1));
  }

  async function handleResetAllPUPR() {
    const confirmed = await toast.confirm(
      'Hapus SELURUH override harga material Anda?', 
      'Tindakan ini akan mengembalikan semua harga kustom ke standar PUPR. Tindakan ini tidak dapat dibatalkan.'
    );
    if (!confirmed) return;
    setLoading(true);
    const { error } = await supabase
      .from('master_harga_custom')
      .delete()
      .not('overrides_harga_dasar_id', 'is', null);

    if (error) {
      toast.error('Gagal reset: ' + error.message);
    } else {
      showToast('✅ Berhasil meriset seluruh katalog ke standar PUPR.');
      loadData();
      loadStats();
    }
    setLoading(false);
  }

  function handleCustomSaved() {
    setShowCustomModal(false);
    showToast('✅ Harga custom berhasil ditambahkan!');
    loadData();
    loadStats();
  }

  return (
    <div className="bg-slate-50 dark:bg-[#0f172a] min-h-screen">

      {/* MODAL OVERRIDE HARGA PUPR */}
      {overrideRow && (
        <ModalOverrideHarga
          puprRow={overrideRow}
          onClose={() => setOverrideRow(null)}
          onSaved={() => {
            setOverrideRow(null);
            showToast('✅ Override harga berhasil disimpan! AHSP Anda sudah menggunakan harga baru.');
            loadData();
            loadStats();
          }}
        />
      )}

      {/* MODAL TAMBAH CUSTOM */}
      {showCustomModal && (
        <ModalTambahCustom
          onClose={() => setShowCustomModal(false)}
          onSaved={handleCustomSaved}
        />
      )}

      {/* TOAST */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* HEADER */}
      <div className="text-center py-6 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-[16px] uppercase font-bold text-slate-900 dark:text-slate-100 tracking-wide">KATALOG HARGA DASAR (PUPR KOTA KOTAMOBAGU 2026)</h1>
        <p className="text-[8px] text-slate-600 dark:text-slate-400 mt-1 uppercase tracking-wider">HARGA DASAR MATERIAL, UPAH, DAN ALAT</p>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {errorMsg && (
          <div className="mb-4 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-400 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Admin info banner */}
        {isAdmin && (
          <div className="mb-4 flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-amber-700 dark:text-amber-400">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>
              <strong>Mode Admin:</strong> Klik angka Harga Satuan / TKDN untuk mengeditnya langsung. Harga Custom milik Anda ditandai badge <span className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 px-1 rounded">Custom</span>.
            </span>
          </div>
        )}

        {/* User info banner */}
        {(isPro || isNormal) && (
          <div className="mb-4 flex items-center gap-2 text-xs bg-indigo-50 dark:bg-orange-900/20 border border-indigo-200 dark:border-orange-800 rounded-lg px-3 py-2 text-indigo-700 dark:text-orange-400">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
            </svg>
            <span>
              <strong>Mode Personal:</strong> Anda dapat menambah Harga Custom pribadi dan melakukan Override pada harga PUPR. Harga Resmi PUPR hanya dapat dilihat.
            </span>
          </div>
        )}

        {/* CONTROLS */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-4 p-3 bg-white dark:bg-[#1e293b] rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-sm flex-wrap">
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Total PUPR: <span className="text-indigo-700 dark:text-orange-400">{totalCount}</span>
            </div>
            {canAddCustom && (
              <div className="font-semibold text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700 pl-4">
                Harga Custom Anda: <span className="text-indigo-600 dark:text-orange-400">{customCount}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap items-center ml-auto">
            {/* Tombol Tambah Harga Custom */}
            {canAddCustom && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCustomModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 dark:bg-orange-600 hover:bg-indigo-700 dark:hover:bg-orange-700 text-white text-sm font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Harga Custom
                </button>
                <button
                  onClick={handleResetAllPUPR}
                  className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Reset semua override ke PUPR"
                >
                  <Trash2 className="w-4 h-4 inline mr-2" />
                  Reset ke PUPR
                </button>
              </div>
            )}

            <select value={kategoriFilter} onChange={e => { setKategoriFilter(e.target.value); setPage(1); }} className="text-sm border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 py-2 px-2">
              <option value="">Semua Kategori</option>
              <option value="Alat">Alat</option>
              <option value="Bahan">Bahan</option>
              <option value="Upah">Upah</option>
              <option value="Lumpsum">Lumpsum</option>
            </select>
            <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }} className="text-sm border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 py-2 px-2">
              <option value={10}>10 Baris</option>
              <option value={20}>20 Baris</option>
              <option value={50}>50 Baris</option>
              <option value={100}>100 Baris</option>
            </select>
          </div>
        </div>

        {/* SEARCH BAR GLOBAL */}
        <div className="mb-6 p-4 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 shadow-sm flex items-center">
          <svg className="w-5 h-5 text-slate-400 mr-2 shrink-0" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <input
            placeholder="Cari Kode atau Nama Item di seluruh Database (PUPR + Custom Anda)..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            className="w-full border-0 bg-transparent text-sm focus:outline-none focus:ring-0 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 font-medium"
          />
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-[#1e293b]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-indigo-600 dark:bg-orange-600 text-white">
              <tr>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">KODE ITEM</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">NAMA ITEM</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">SAT.</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">
                  HARGA SATUAN
                  {canAddCustom && <span className="ml-1 text-amber-200 text-[9px] font-normal">(klik untuk edit)</span>}
                </th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">
                  TKDN
                  {canAddCustom && <span className="ml-1 text-orange-200 text-[9px] font-normal">(klik untuk edit)</span>}
                </th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">SUMBER</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan="7" className="text-center py-10 text-slate-500">Memuat data...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-12 text-slate-500">Rekod tidak ditemukan.</td></tr>
              ) : (
                data.map((row, index) => {
                  const isCustom = row.source_table === 'master_harga_custom';
                  const isOwn = isCustom; // View RLS sudah filter
                  // Siapa yang boleh edit?
                  const canEditRow = isAdmin || (canAddCustom && isCustom && isOwn);

                  return (
                    <tr
                      key={row.id || index}
                      className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 even:bg-slate-50/50 even:dark:bg-slate-800/40 ${isCustom ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}
                    >
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-indigo-700 dark:text-orange-400">
                        {row.kode_item || <span className="text-slate-400 italic">-</span>}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-normal min-w-[200px]">
                        {row.nama_item}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-400 font-mono text-xs">{row.satuan || '-'}</td>

                      {/* Inline editable harga */}
                      <InlineHargaCell
                        rowId={row.id}
                        hargaSatuan={row.harga_satuan}
                        isEditable={canEditRow}
                        onSave={handleSaveHarga}
                      />

                      {/* Inline editable TKDN */}
                      <InlineTkdnCell
                        rowId={row.id}
                        tkdnPercent={row.tkdn_percent}
                        isEditable={canEditRow}
                        onSave={handleSaveTkdn}
                      />

                      {/* Badge Sumber */}
                      <td className="px-3 py-3 text-xs">
                        {isCustom ? (
                          <span className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold border border-indigo-200 dark:border-indigo-700">
                            ✏️ Custom
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium border border-slate-200 dark:border-slate-600">
                            🔒 PUPR
                          </span>
                        )}
                      </td>

                      {/* Aksi: Override (PUPR) / Hapus (Custom) */}
                      <td className="px-3 py-3 text-center">
                        {isCustom && canAddCustom && (
                          <button
                            onClick={() => handleDeleteCustom(row.id)}
                            title="Hapus harga custom ini"
                            className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                        {!isCustom && canAddCustom && (
                          <button
                            onClick={() => setOverrideRow(row)}
                            title="Set harga override pribadi Anda untuk item PUPR ini"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 border border-violet-300 dark:border-violet-600 hover:border-violet-500 px-2 py-1 rounded-lg transition-colors"
                          >
                            🔧 Override
                          </button>
                        )}
                      </td>
                    </tr>
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
      </main>
    </div>
  );
}
