const ExcelJS = require('exceljs');
const { 
  romanize, formatIdr, cleanStr, formatTerbilang, 
  clearDataRows, applyBorder, setupPrinter 
} = require('./excel_utils');

/**
 * generateLaporanReport (Full Formula Version)
 * Mengisi 5 sheet database untuk dikonsumsi rumus di template utama.
 */
const generateLaporanReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const paperSize = options.paperSize || 'A4';
  const headerImage = options.headerImage || null;
  
  const response = await fetch(`/templates/master_template_custom.xlsx?v=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Gagal mendownload template excel dari server.');
  }
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  let headerImageId = null;
  if (headerImage) {
    try {
      let base64Murni = headerImage.includes(',') ? headerImage.split(',')[1] : headerImage;
      headerImageId = workbook.addImage({ base64: base64Murni, extension: 'png' });
    } catch (e) { console.error('Gagal muat gambar:', e); }
  }

  // Helper untuk mendapatkan worksheet secara case-insensitive
  const getWS = (name) => workbook.getWorksheet(name) || workbook.getWorksheet(name.toUpperCase()) || workbook.getWorksheet(name.toLowerCase());

  const wsTenaga = getWS('database tenaga');
  const wsBahan = getWS('database bahan');
  const wsAlat = getWS('database alat');
  const wsVolume = getWS('database volume');
  const wsHarga = getWS('database harga');
  const wsMetadata = getWS('database') || getWS('metadata');

  const targetDay = options.startDate;
  const sD = new Date(options.startDate);
  const eD = new Date(options.endDate);

  // 1. Progress & Resource Data untuk hari target
  const progDaily = (options.progressData || []).filter(p => {
    const d = new Date(project.start_date);
    d.setDate(d.getDate() + (p.day_number - 1));
    return d.toISOString().split('T')[0] === targetDay;
  });

  // 2. Fill Database Tenaga (XLSX: database tenaga)
  if (wsTenaga) {
    wsTenaga.eachRow((row, r) => { if (r > 1) row.values = []; });
    let r = 2;
    progDaily.forEach(p => {
      if (p.entity_type === 'resource' || p.entity_type === 'custom_labor') {
        const res = (options.resources || []).find(res => (res.kode_item || res.uraian) === p.entity_key);
        if (res?.jenis === 'tenaga' || p.entity_type === 'custom_labor') {
          wsTenaga.getRow(r++).values = [p.entity_name || p.entity_key, Number(p.val), res?.satuan || 'OH'];
        }
      }
    });
  }

  // 3. Fill Database Bahan (XLSX: database bahan)
  if (wsBahan) {
    wsBahan.eachRow((row, r) => { if (r > 1) row.values = []; });
    let r = 2;
    progDaily.filter(p => p.entity_type === 'resource').forEach(p => {
      const res = (options.resources || []).find(res => (res.kode_item || res.uraian) === p.entity_key);
      if (res?.jenis === 'bahan') {
        wsBahan.getRow(r++).values = [res.uraian, Number(p.val), res.satuan];
      }
    });
  }

  // 4. Fill Database Alat (XLSX: database alat)
  if (wsAlat) {
    wsAlat.eachRow((row, r) => { if (r > 1) row.values = []; });
    let r = 2;
    progDaily.filter(p => p.entity_type === 'resource').forEach(p => {
      const res = (options.resources || []).find(res => (res.kode_item || res.uraian) === p.entity_key);
      if (res?.jenis === 'alat') {
        wsAlat.getRow(r++).values = [res.uraian, Number(p.val), res.satuan];
      }
    });
  }

  // 5. Fill Database Volume (XLSX: database volume)
  if (wsVolume) {
    wsVolume.eachRow((row, r) => { if (r > 1) row.values = []; });
    const totalProjectPrice = ahspLines.reduce((acc, l) => acc + (Number(l.volume || 0) * Number(l.harga_satuan || 0)), 0);
    
    // Summary progress untuk periode Mingguan/Bulanan
    const summary = {};
    (options.progressData || []).forEach(p => {
      if (!summary[p.entity_id]) summary[p.entity_id] = { lalu: 0, ini: 0, total: 0 };
      const d = new Date(project.start_date);
      d.setDate(d.getDate() + (p.day_number - 1));
      const val = Number(p.val || 0);
      if (d < sD) summary[p.entity_id].lalu += val;
      else if (d >= sD && d <= eD) summary[p.entity_id].ini += val;
      summary[p.entity_id].total += val;
    });

    let r = 2;
    ahspLines.forEach(l => {
      const sp = summary[l.id] || { lalu: 0, ini: 0, total: 0 };
      const pToday = progDaily.find(pd => pd.entity_id === l.id)?.val || 0;
      const bobot = totalProjectPrice > 0 ? (Number(l.volume) * Number(l.harga_satuan) / totalProjectPrice) : 0;
      
      wsVolume.getRow(r++).values = [
        l.id, l.uraian, l.satuan, Number(l.volume), Number(l.harga_satuan), bobot,
        Number(pToday), Number(sp.lalu), Number(sp.ini), Number(sp.total)
      ];
    });
  }

  // 6. Fill Database Harga (XLSX: database harga)
  if (wsHarga) {
    wsHarga.eachRow((row, r) => { if (r > 1) row.values = []; });
    let r = 2;
    (options.resources || []).forEach(res => {
      wsHarga.getRow(r++).values = [res.kode_item || res.uraian, res.uraian, res.satuan, Number(res.harga_satuan || 0)];
    });
  }

  // 7. Metadata Umum & Cuaca (XLSX: database)
  if (wsMetadata) {
    const dayReport = (options.dailyReports || []).find(dr => dr.report_date === targetDay);
    const weatherLabels = { 1: 'Cerah', 2: 'Berawan', 3: 'Gerimis', 4: 'Hujan', 5: 'Badai' };
    
    const meta = [
      ['NAMA_PROYEK', project.work_name || project.name || ''],
      ['LOKASI', project.location || ''],
      ['TAHUN_ANGGARAN', project.fiscal_year || ''],
      ['KONTRAKTOR', project.contractor_name || ''],
      ['DIREKTUR', project.kontraktor_director || ''],
      ['TANGGAL_AWAL', options.startDate || ''],
      ['TANGGAL_AKHIR', options.endDate || ''],
      ['CUACA_INDEX', weatherLabels[dayReport?.weather_index] || 'Cerah'],
      ['CUACA_KET', dayReport?.weather_description || '-'],
      ['DIBUAT_OLEH', companyName]
    ];
    meta.forEach((m, i) => {
      wsMetadata.getCell(`R${i + 1}`).value = m[0];
      wsMetadata.getCell(`S${i + 1}`).value = m[1];
    });
  }

  // Cleanup & Hide Sheets
  const worksheets = [...workbook.worksheets];
  worksheets.forEach(ws => {
    const lowName = ws.name.toLowerCase();
    const isSelected = selectedSheets.some(s => ws.name.toLowerCase().includes(s.toLowerCase()));
    
    // Sembunyikan Database (Status: hidden agar bisa unhide manual)
    if (lowName.includes('database')) {
      ws.state = 'hidden'; 
      return;
    }

    if (!isSelected) {
      ws.state = 'veryHidden';
    } else {
      if (headerImageId) ws.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      const isPortrait = lowName.includes('harian');
      setupPrinter(ws, companyName, isPortrait ? 'A1:N71' : null, paperSize, isPortrait ? 'portrait' : 'landscape');
    }
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName || `Laporan_${project.name}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
};

export { generateLaporanReport };
