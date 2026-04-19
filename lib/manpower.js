/* ── Helper: add N calendar days to a date string ─────────────────── */
export function addDays(dateStr, days) {
  if (!dateStr || days == null) return null;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const parseNum = (v) => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : 0;
};

/* ── CalculateWorkersAndDuration (Logic from MODCORE) ─────────────────────── */
export function calculateWorkersAndDuration({
  vol,
  laborRes,
  laborSettings,
  manualPekerjaTotal,
  manualDurasi,
}) {
  const safeVol = Math.max(parseNum(vol), 0.0001);

  // PRIORITAS 1: Input total pekerja manual
  if (manualPekerjaTotal > 0) {
    const durations = laborRes.map(res => {
      const koef = parseNum(res.total_volume_terpakai) / safeVol;
      return (parseNum(vol) * koef) / manualPekerjaTotal;
    });
    const finalDurasi = Math.ceil(Math.max(...durations, 1));
    return {
      pekerjaPerHari: Math.round(manualPekerjaTotal),
      durasi: finalDurasi,
    };
  }

  // PRIORITAS 2: Target durasi manual
  if (manualDurasi > 0) {
    const totalRequired = laborRes.reduce((sum, res) => {
      const koef = parseNum(res.total_volume_terpakai) / safeVol;
      return sum + ((parseNum(vol) * koef) / manualDurasi);
    }, 0);
    return {
      pekerjaPerHari: Math.ceil(totalRequired),
      durasi: manualDurasi,
    };
  }

  // PRIORITAS 3: BOTTLENECK LOGIC (Global Settings)
  // Jika tidak ada tenaga kerja terdeteksi (Lumpsum/Material Only), berikan durasi minimal 1 hari
  // agar item muncul di Gantt Chart dan Kurva-S.
  if (laborRes.length === 0) return { pekerjaPerHari: 0, durasi: 1 };

  const durationsRaw = laborRes.map(res => {
    const koef = parseNum(res.total_volume_terpakai) / safeVol;
    const roleSetting = laborSettings[res.uraian] || {};
    const qty = Math.max(parseNum(roleSetting.count || 1), 1);
    const eff = (parseNum(roleSetting.eff || laborSettings.efektivitas || 100)) / 100;
    return (parseNum(vol) * koef) / (qty * eff);
  });

  const maxRawDurasi = Math.max(...durationsRaw);
  const finalDurasi = Math.ceil(Math.max(maxRawDurasi, 1));

  const totalInvolved = laborRes.reduce((sum, res) => {
    const roleSetting = laborSettings[res.uraian] || {};
    return sum + Math.max(parseNum(roleSetting.count || 1), 1);
  }, 0);

  return {
    pekerjaPerHari: totalInvolved,
    durasi: finalDurasi,
  };
}

/* ── Compute Manpower per Line ────────────────────────────────────────────── */
export function computeManpower(ahspLines, catalogMap, laborSettings = {}, itemWorkers = {}, itemDurasi = {}) {
  return ahspLines.map(line => {
    // Prioritas: gunakan analisa_custom dari baris itu sendiri (jika ada), 
    // jika tidak ada baru gunakan data dari mapping katalog master AHSP.
    const details = (line.analisa_custom && line.analisa_custom.length > 0) 
      ? line.analisa_custom 
      : (catalogMap[line.master_ahsp_id] || []);
    
    // Identifikasi komponen upah/labor dengan pengecekan bertingkat:
    // 1. Berdasarkan field 'jenis_komponen' atau 'jenis'
    // 2. Berdasarkan kata kunci (keyword) dalam uraian (Pekerja, Tukang, Mandor, dll)
    const laborRes = details.filter(d => {
      const type = (d.jenis_komponen || d.jenis || '').toLowerCase();
      const kode = (d.kode_item || d.kode || '').toUpperCase();
      const uraian = (d.uraian || '').toLowerCase();
      
      // Prioritas 1: Kode Item dimulai dengan L.
      if (kode.startsWith('L.')) return true;

      // Prioritas 2: Tipe eksplisit
      const isExplicitLabor = type === 'upah' || type === 'labor' || type === 'tenaga' || type === 'pekerja';
      if (isExplicitLabor) return true;
      
      // Fallback: Cek kata kunci dalam deskripsi (Bahasa Indonesia) - Harus lebih spesifik
      const hasLaborKeyword = 
        uraian === 'pekerja' || 
        uraian === 'tukang' || 
        uraian === 'mandor' || 
        uraian === 'kepala tukang' ||
        uraian.includes('tenaga kerja') ||
        uraian === 'laborer';
        
      return hasLaborKeyword;
    });
    
    const mappedLaborRes = laborRes.map(lr => ({
      uraian: lr.uraian,
      total_volume_terpakai: parseNum(line.volume) * parseNum(lr.koefisien),
    }));

    const vol = parseNum(line.volume);
    const maxKoefDetail = laborRes.length > 0 ? Math.max(...laborRes.map(r => parseNum(r.koefisien))) : 0;
    const totalUpah = laborRes.reduce((s, r) => {
      const volItem = parseNum(line.volume);
      const koef = parseNum(r.koefisien);
      // Mendukung field harga_konversi, harga_satuan, atau harga
      const harga = parseNum(r.harga_konversi || r.harga_satuan || r.harga);
      return s + (volItem * koef * harga);
    }, 0);

    const manualPekerjaTotal = parseNum(itemWorkers[line.id] || line.pekerja_input);
    const manualDurasi = parseNum(itemDurasi[line.id] || line.durasi_input);

    let durasi_hari = null, pekerjaPerHari = 0;
    if (vol > 0) {
      const res = calculateWorkersAndDuration({
        vol,
        laborRes: mappedLaborRes,
        laborSettings,
        manualPekerjaTotal,
        manualDurasi,
      });
      durasi_hari = res.durasi;
      pekerjaPerHari = res.pekerjaPerHari;
    }

    return {
      ...line,
      uraian: line.uraian_custom || line.uraian || 'Tanpa Nama',
      bab: line.bab_pekerjaan || 'Tanpa Kategori',
      durasi_hari,
      total_upah: totalUpah,
      pekerja: pekerjaPerHari,
      has_labor: laborRes.length > 0,
      nilai_pekerjaan: parseNum(line.jumlah)
    };
  }).filter(r => parseNum(r.volume) > 0);
}

/* ── Ripple Effect Sequencing ──────────────────────────────────────────────── */
export function getSequencedSchedule(manpowerItems, projectStartDate, startDatesOveride = {}) {
  if (!manpowerItems.length) return [];
  const base = projectStartDate || new Date().toISOString().slice(0, 10);
  let cursor = base;
  
  return manpowerItems.map(item => {
    const manualStart = startDatesOveride[item.id] || item.start_date;
    const itemStart = manualStart || cursor;
    const dur = item.durasi_hari;
    const itemEnd = (itemStart && dur) ? addDays(itemStart, dur - 1) : null;
    
    // Ripple effect: next item starts after this one finishes
    cursor = itemEnd ? addDays(itemEnd, 1) : itemStart;
    
    return { 
      ...item, 
      seq_start: itemStart, 
      seq_end: itemEnd, 
      is_manual: !!manualStart 
    };
  });
}
