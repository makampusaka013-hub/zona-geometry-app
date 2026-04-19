import * as XLSX from 'xlsx';
import { toast } from '@/lib/toast';

/**
 * Utility to format Indonesian Rupiah
 */
export function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(n || 0);
}

/**
 * Utility to format numbers
 */
export function fmt(n) { 
  return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }); 
}

/**
 * Convert number to Roman numeral
 */
export function romanize(num) {
  if (isNaN(num)) return '';
  const digits = String(+num).split('');
  const key = [
    '','C','CC','CCC','CD','D','DC','DCC','DCCC','CM',
    '','X','XX','XXX','XL','L','LX','LXX','LXXX','XC',
    '','I','II','III','IV','V','VI','VII','VIII','IX'
  ];
  let roman = '';
  let i = 3;
  while (i--) roman = (key[+digits.pop() + (i * 10)] || '') + roman;
  return Array(+digits.join('') + 1).join('M') + roman;
}

/**
 * 1. Export Regional Price Catalog
 */
export function exportProRegionalCatalog(locationName, data) {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [`KATALOG HARGA SATUAN DASAR - WILAYAH: ${locationName.toUpperCase()}`],
    [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['NO', 'KODE', 'URAIAN KOMPONEN', 'SATUAN', 'JENIS', 'HARGA DASAR (Rp)', 'KETERANGAN']
  ];

  data.forEach((item, idx) => {
    wsData.push([
      idx + 1,
      item.master_items?.kode_item || '-',
      item.master_items?.uraian || '-',
      item.master_items?.satuan || '-',
      item.master_items?.jenis || '-',
      Number(item.harga_dasar || 0),
      `Update: ${new Date(item.updated_at).toLocaleDateString('id-ID')}`
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 45 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws, "Katalog Harga");
  XLSX.writeFile(wb, `Katalog_Harga_${locationName}.xlsx`);
  toast.success(`Katalog wilayah ${locationName} berhasil diunduh.`);
}

/**
 * 2. Export Master AHSP with Details
 */
export function exportProMasterAhsp(data) {
  // data expected: array of { ...ahsp, details: [] }
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['KATALOG ANALISA HARGA SATUAN PEKERJAAN (AHSP)'],
    [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['KODE AHSP', 'URAIAN PEKERJAAN / KOMPONEN', 'SATUAN', 'KOEFISIEN', 'HARGA SATUAN (Rp)', 'JUMLAH (Rp)']
  ];

  data.forEach((ahsp) => {
    // Header for the AHSP
    wsData.push([
      ahsp.kode_ahsp,
      ahsp.uraian.toUpperCase(),
      ahsp.satuan,
      '',
      '',
      ''
    ]);

    // Labor
    const labor = (ahsp.details || []).filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'upah');
    if (labor.length) {
      wsData.push(['', 'A. TENAGA', '', '', '', '']);
      labor.forEach(d => {
        wsData.push(['', d.uraian, d.satuan, Number(d.koefisien), Number(d.harga_satuan || 0), Number(d.total_harga || 0)]);
      });
    }

    // Material
    const material = (ahsp.details || []).filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'bahan');
    if (material.length) {
      wsData.push(['', 'B. BAHAN', '', '', '', '']);
      material.forEach(d => {
        wsData.push(['', d.uraian, d.satuan, Number(d.koefisien), Number(d.harga_satuan || 0), Number(d.total_harga || 0)]);
      });
    }

    // Equipment
    const equipment = (ahsp.details || []).filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'alat');
    if (equipment.length) {
      wsData.push(['', 'C. PERALATAN', '', '', '', '']);
      equipment.forEach(d => {
        wsData.push(['', d.uraian, d.satuan, Number(d.koefisien), Number(d.harga_satuan || 0), Number(d.total_harga || 0)]);
      });
    }

    wsData.push(['', 'JUMLAH HARGA SATUAN PEKERJAAN', '', '', '', Number(ahsp.total_harga || 0)]);
    wsData.push([]); // Gap
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "Katalog AHSP");
  XLSX.writeFile(wb, `Katalog_AHSP_Master.xlsx`);
  toast.success('Katalog AHSP berhasil diunduh.');
}

/**
 * 3. Export S-Curve & Gantt Chart
 * 4 weeks per month implementation
 */
export function exportProScurveGantt(project, scheduleData) {
  if (!scheduleData.length) {
    toast.error('Data jadwal tidak tersedia.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const projectStart = new Date(project.start_date || new Date());
  
  // Calculate project range in days
  const lastDate = new Date(Math.max(...scheduleData.map(d => new Date(d.seq_end))));
  const totalDays = Math.ceil((lastDate - projectStart) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);
  const totalMonths = Math.ceil(totalWeeks / 4);

  const wsData = [];
  wsData.push(['JADUAL PELAKSANAAN PEKERJAAN (KURVA - S)']);
  wsData.push(['Pekerjaan', ':', project.work_name || project.name]);
  wsData.push(['Lokasi', ':', project.location || '-']);
  wsData.push([]);

  // Table Headers
  const headerRow1 = ['NO', 'URAIAN PEKERJAAN', 'START', 'END', 'DUR (H)', 'BOBOT (%)'];
  const headerRow2 = ['', '', '', '', '', ''];
  
  // Add Months and Weeks to header
  for (let m = 1; m <= totalMonths; m++) {
    headerRow1.push(`BULAN KE-${m}`, '', '', '');
    for (let w = 1; w <= 4; w++) {
      headerRow2.push(`W-${w}`);
    }
  }
  headerRow1.push('KUMULATIF %');
  headerRow2.push('');

  wsData.push(headerRow1);
  wsData.push(headerRow2);

  const totalProjectValue = scheduleData.reduce((s, it) => s + (it.jumlah || 0), 0);
  const weeklyWeights = new Array(totalMonths * 4).fill(0);

  // Group by Bab
  const babs = {};
  scheduleData.forEach(item => {
    if (!babs[item.bab]) babs[item.bab] = [];
    babs[item.bab].push(item);
  });

  let globalIdx = 1;
  Object.keys(babs).forEach((babName, bIdx) => {
    wsData.push([romanize(bIdx + 1), babName.toUpperCase(), '', '', '', '']);
    
    babs[babName].forEach(item => {
      const bobot = (item.jumlah / totalProjectValue) * 100;
      const row = [
        globalIdx++,
        item.uraian,
        item.seq_start,
        item.seq_end,
        item.durasi_hari,
        fmt(bobot)
      ];

      // Distribution logic (Linear)
      const startDay = Math.floor((new Date(item.seq_start) - projectStart) / (1000 * 60 * 60 * 24));
      for (let i = 0; i < totalMonths * 4; i++) {
         const weekStartDay = i * 7;
         const weekEndDay = (i + 1) * 7;
         
         const taskStart = startDay;
         const taskEnd = startDay + (item.durasi_hari || 0);
         
         // Overlap calculation
         const overlapStart = Math.max(weekStartDay, taskStart);
         const overlapEnd = Math.min(weekEndDay, taskEnd);
         const overlapDays = Math.max(0, overlapEnd - overlapStart);
         
         if (overlapDays > 0) {
           const weekWeight = (overlapDays / (item.durasi_hari || 1)) * bobot;
           row.push(fmt(weekWeight));
           weeklyWeights[i] += weekWeight;
         } else {
           row.push('');
         }
      }
      wsData.push(row);
    });
  });

  // Cumulative Footer
  const cumWeightsRow = ['', 'BOBOT RENCANA MINGGUAN', '', '', '', ''];
  const totalCumRow = ['', 'KUMULATIF RENCANA', '', '', '', ''];
  let rollingCum = 0;
  
  weeklyWeights.forEach(w => {
    cumWeightsRow.push(fmt(w));
    rollingCum += w;
    // Fix floating point 100%
    const displayCum = rollingCum > 99.99 ? 100 : rollingCum;
    totalCumRow.push(fmt(displayCum));
  });

  wsData.push([]);
  wsData.push(cumWeightsRow);
  wsData.push(totalCumRow);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "S-Curve");
  XLSX.writeFile(wb, `S-Curve_${project.name}.xlsx`);
  toast.success('Kurva-S & Jadwal berhasil diunduh.');
}

/**
 * 4. Export RAB Summary (Rekapitulasi)
 */
export function exportProRabSummary(project, items) {
  const wb = XLSX.utils.book_new();
  const ppnPercent = parseFloat(project.ppn_percent) || 12;

  // 1. REKAPITULASI SHEET
  const rekapData = [
    ['REKAPITULASI RENCANA ANGGARAN BIAYA'],
    ['Pekerjaan', ':', project.work_name || project.name],
    ['Lokasi', ':', project.location || '-'],
    [],
    ['NO', 'URAIAN PEKERJAAN', 'JUMLAH HARGA (Rp)']
  ];

  const sectionsObj = {};
  items.forEach(line => {
    const bab = line.bab_pekerjaan || 'UMUM';
    if (!sectionsObj[bab]) sectionsObj[bab] = { name: bab, total: 0 };
    sectionsObj[bab].total += (line.jumlah || 0);
  });
  const sections = Object.values(sectionsObj);
  const grandSubtotal = sections.reduce((s, b) => s + b.total, 0);

  sections.forEach((sec, i) => {
    rekapData.push([romanize(i+1), sec.name.toUpperCase(), sec.total]);
  });
  
  const ppnAmount = grandSubtotal * (ppnPercent / 100);
  const grandTotal = grandSubtotal + ppnAmount;
  const rounded = Math.round(grandTotal / 1000) * 1000;

  rekapData.push([]);
  rekapData.push(['', 'A. TOTAL HARGA PEKERJAAN', grandSubtotal]);
  rekapData.push(['', `B. PPN ${ppnPercent}%`, ppnAmount]);
  rekapData.push(['', 'C. TOTAL KESELURUHAN', grandTotal]);
  rekapData.push(['', 'DIBULATKAN', rounded]);
  rekapData.push([]);
  
  // Signatures
  rekapData.push([]);
  rekapData.push(['', 'Disetujui Oleh:', 'Diperiksa Oleh:', 'Dibuat Oleh:']);
  rekapData.push(['', 'Pejabat Pembuat Komitmen (PPK)', 'Konsultan Pengawas', 'Kontraktor Pelaksana']);
  rekapData.push([], [], []);
  rekapData.push(['', project.ppk_name || '(................)', project.konsultan_supervisor || '(................)', project.kontraktor_director || '(................)']);
  rekapData.push(['', project.ppk_nip ? `NIP: ${project.ppk_nip}` : '', '', '']);

  const wsRekap = XLSX.utils.aoa_to_sheet(rekapData);
  XLSX.utils.book_append_sheet(wb, wsRekap, "Rekapitulasi");

  // 2. DETAIL RAB SHEET
  const detailData = [
    ['DAFTAR KUANTITAS DAN HARGA'],
    [],
    ['NO', 'URAIAN PEKERJAAN', 'SATUAN', 'VOLUME', 'HARGA SATUAN (Rp)', 'JUMLAH HARGA (Rp)']
  ];

  sections.forEach((sec, sIdx) => {
    detailData.push([romanize(sIdx+1), sec.name.toUpperCase(), '', '', '', '']);
    const lines = items.filter(l => (l.bab_pekerjaan || 'UMUM') === sec.name);
    lines.forEach((l, lIdx) => {
      detailData.push([lIdx+1, l.uraian, l.satuan, l.volume, l.harga_satuan, l.jumlah]);
    });
    detailData.push(['', `Sub Total ${sec.name}`, '', '', '', sec.total]);
    detailData.push([]);
  });

  const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
  XLSX.utils.book_append_sheet(wb, wsDetail, "Detail RAB");

  XLSX.writeFile(wb, `Laporan_RAB_${project.name}.xlsx`);
  toast.success('Rekapitulasi & Detail RAB berhasil diunduh.');
}

/**
 * 5. Export Used Resource Prices (Harga Satuan Terpakai)
 */
export function exportProUsedResources(project, items) {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [`DAFTAR HARGA SATUAN DASAR TERPAKAI - PROYEK: ${project.name.toUpperCase()}`],
    [`Lokasi: ${project.location || '-'}`],
    [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['NO', 'KODE', 'URAIAN KOMPONEN', 'SATUAN', 'JENIS', 'HARGA SATUAN (Rp)']
  ];

  // Aggregating unique resources
  const resources = new Map();
  items.forEach(item => {
    (item.master_ahsp?.details || item.analisa_custom || []).forEach(d => {
      const key = d.kode_item || d.uraian;
      if (!resources.has(key)) {
        resources.set(key, {
          kode: d.kode_item || '-',
          uraian: d.uraian,
          satuan: d.satuan,
          jenis: d.jenis_komponen || d.jenis || '-',
          harga: d.harga_satuan_snapshot || d.harga_satuan || 0
        });
      }
    });
  });

  const sorted = Array.from(resources.values()).sort((a, b) => {
    if (a.jenis !== b.jenis) return a.jenis.localeCompare(b.jenis);
    return a.uraian.localeCompare(b.uraian);
  });

  sorted.forEach((r, idx) => {
    wsData.push([idx + 1, r.kode, r.uraian, r.satuan, r.jenis.toUpperCase(), Number(r.harga)]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 45 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "Harga Terpakai");
  XLSX.writeFile(wb, `Harga_Terpakai_${project.name}.xlsx`);
  toast.success('Daftar harga terpakai berhasil diunduh.');
}

/**
 * 6. Export Used AHSP (AHSP Terpakai)
 */
export function exportProUsedAhsp(project, items) {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [`ANALISA HARGA SATUAN PEKERJAAN - PROYEK: ${project.name.toUpperCase()}`],
    [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['KODE AHSP', 'URAIAN PEKERJAAN / KOMPONEN', 'SATUAN', 'KOEFISIEN', 'HARGA SATUAN (Rp)', 'JUMLAH (Rp)']
  ];

  items.forEach((line) => {
    const details = line.master_ahsp?.details || line.analisa_custom || [];
    
    wsData.push([
      line.master_ahsp?.kode_ahsp || '-',
      line.uraian.toUpperCase(),
      line.satuan,
      '',
      '',
      ''
    ]);

    const labor = details.filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'upah');
    if (labor.length) {
      wsData.push(['', 'A. TENAGA', '', '', '', '']);
      labor.forEach(d => {
        wsData.push(['', d.uraian, d.satuan, Number(d.koefisien), Number(d.harga_satuan_snapshot || d.harga_satuan || 0), Number(d.jumlah_harga_snapshot || d.jumlah_harga || 0)]);
      });
    }

    const material = details.filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'bahan');
    if (material.length) {
      wsData.push(['', 'B. BAHAN', '', '', '', '']);
      material.forEach(d => {
        wsData.push(['', d.uraian, d.satuan, Number(d.koefisien), Number(d.harga_satuan_snapshot || d.harga_satuan || 0), Number(d.jumlah_harga_snapshot || d.jumlah_harga || 0)]);
      });
    }

    const equipment = details.filter(d => (d.jenis_komponen || d.jenis || '').toLowerCase() === 'alat');
    if (equipment.length) {
      wsData.push(['', 'C. PERALATAN', '', '', '', '']);
      equipment.forEach(d => {
        wsData.push(['', d.uraian, d.satuan, Number(d.koefisien), Number(d.harga_satuan_snapshot || d.harga_satuan || 0), Number(d.jumlah_harga_snapshot || d.jumlah_harga || 0)]);
      });
    }

    wsData.push(['', 'JUMLAH HARGA SATUAN PEKERJAAN', '', '', '', Number(line.harga_satuan || 0)]);
    wsData.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "AHSP Terpakai");
  XLSX.writeFile(wb, `AHSP_Terpakai_${project.name}.xlsx`);
  toast.success('Detail AHSP terpakai berhasil diunduh.');
}
