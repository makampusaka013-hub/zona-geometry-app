const ExcelJS = require('exceljs');

const romanize = (num) => {
  const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
  let roman = '';
  for (let i in lookup) {
    while (num >= lookup[i]) {
      roman += i;
      num -= lookup[i];
    }
  }
  return roman;
};

const formatIdr = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
};

const formatTerbilang = (n) => {
  if (n < 0) return "Minus " + formatTerbilang(-n);
  const words = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  let res = "";
  if (n < 12) res = words[n];
  else if (n < 20) res = formatTerbilang(n - 10) + " Belas";
  else if (n < 100) res = formatTerbilang(Math.floor(n / 10)) + " Puluh " + formatTerbilang(n % 10);
  else if (n < 200) res = "Seratus " + formatTerbilang(n - 100);
  else if (n < 1000) res = formatTerbilang(Math.floor(n / 100)) + " Ratus " + formatTerbilang(n % 100);
  else if (n < 2000) res = "Seribu " + formatTerbilang(n - 1000);
  else if (n < 1000000) res = formatTerbilang(Math.floor(n / 1000)) + " Ribu " + formatTerbilang(n % 1000);
  else if (n < 1000000000) res = formatTerbilang(Math.floor(n / 1000000)) + " Juta " + formatTerbilang(n % 1000000);
  else res = formatTerbilang(Math.floor(n / 1000000000)) + " Miliar " + formatTerbilang(n % 1000000000);
  return res.trim().replace(/\s+/g, ' ') + " Rupiah";
};

const clearDataRows = (ws, startRow, count) => {
  for (let i = 0; i < count; i++) {
    const row = ws.getRow(startRow + i);
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      cell.style = {};
      cell.border = { top: { style: 'none' }, left: { style: 'none' }, bottom: { style: 'none' }, right: { style: 'none' } };
      cell.fill = { type: 'pattern', pattern: 'none' };
    }
  }
};

const applyBorder = (ws, rowNumber, startCol = 'B', endCol = 'I') => {
  const row = ws.getRow(rowNumber);
  const start = startCol.charCodeAt(0) - 64;
  const end = endCol.charCodeAt(0) - 64;
  for (let i = start; i <= end; i++) {
    const cell = row.getCell(i);
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }
};

const setupPrinter = (ws, companyName, printArea = null, paperSize = 'A4', orientation = 'portrait') => {
  if (!ws) return;
  const pSize = paperSize === 'F4' ? 13 : 9;
  ws.pageSetup = {
    paperSize: pSize, orientation: orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.78, right: 0.25, top: 0.25, bottom: 0.39, header: 0, footer: 0.2 }
  };
  if (printArea) ws.pageSetup.printArea = printArea;
  if (!ws.headerFooter) ws.headerFooter = { oddHeader: '', oddFooter: '' };
  ws.headerFooter.oddFooter = `&L&8By : &"Arial,Bold"&KFF8C00ZG &R&8&P / &N`;
};

const getBabWeight = (bab) => {
  if (!bab) return 999;
  const s = String(bab).trim().toUpperCase();
  const m = s.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)/);
  if (!m) return 998;
  const map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15 };
  return map[m[1]] || 997;
};

const generateProjectReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const projectLocation = project.location || project.address || '-';
  const ppnPercent = project?.ppn_percent ?? project?.ppn ?? 11;
  const globalOverhead = project?.profit_percent ?? project?.overhead_percent ?? 15;

  const { isCatalog = false, projectPrices = [], headerImage = null, paperSize = 'A4', isStandalone = false, scheduleData = [], progressData = [] } = options;
  const safeProjectPrices = Array.isArray(projectPrices) ? projectPrices : [];
  const priceMap = Object.fromEntries(safeProjectPrices.map(p => [p.kode_item || p.key_item, p.harga_satuan]));

  const response = await fetch(`/templates/master_template_custom.xlsx?v=${Date.now()}`);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  let headerImageId = null;
  if (headerImage) {
    try {
      let base64Murni = '';
      let extension = 'png';
      if (headerImage.startsWith('http')) {
        const res = await fetch(headerImage);
        const blob = await res.blob();
        extension = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'jpeg' : 'png';
        base64Murni = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64Murni = headerImage.includes(',') ? headerImage.split(',')[1] : headerImage;
        extension = headerImage.includes('jpeg') || headerImage.includes('jpg') ? 'jpeg' : 'png';
      }
      headerImageId = workbook.addImage({ base64: base64Murni, extension: extension });
    } catch (e) { console.error('Logo Error:', e); }
  }

  const sortedLines = [...ahspLines].sort((a, b) => {
    const wa = getBabWeight(a.bab_pekerjaan || a.bab);
    const wb = getBabWeight(b.bab_pekerjaan || b.bab);
    if (wa !== wb) return wa - wb;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const enrichedLines = sortedLines;

  // 1. Process Resources (Harga Satuan)
  const resources = {};
  let totalProjectCostForPercent = 0;
  enrichedLines.forEach(line => {
    const details = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || line.details || []);
    const rabVolume = Number(line.volume || 0);
    details.forEach(d => {
      const itemCode = d.kode_item || d.kode || d.id;
      if (!itemCode) return;
      if (!resources[itemCode]) {
        let itemPrice = Number(d.harga_satuan_snapshot || 0);
        if (itemPrice === 0) itemPrice = Number(priceMap[itemCode] || d.harga_satuan || d.harga || 0);
        resources[itemCode] = {
          kode: itemCode,
          uraian: d.uraian || d.nama_item || d.uraian_custom || '-',
          satuan: d.satuan || '-',
          harga: itemPrice,
          jenis: (d.jenis_komponen || d.jenis || d.jenis_uraian || d.kategori || 'Lainnya').toLowerCase(),
          tkdn: Number(d.tkdn || d.tkdn_percent || 0),
          totalVolume: 0
        };
      }
      resources[itemCode].totalVolume += Number(d.koefisien || 0) * rabVolume;
    });
  });
  Object.values(resources).forEach(r => { totalProjectCostForPercent += r.totalVolume * r.harga; });

  // 2. Sheet: COVER
  const wsCover = workbook.getWorksheet('Cover') || workbook.getWorksheet('COVER');
  if (wsCover) {
    wsCover.getCell('D14').value = (project.work_name || project.name || '-').toUpperCase();
    wsCover.getCell('D18').value = (projectLocation || '-').toUpperCase();
    wsCover.getCell('D20').value = (project.activity_name || project.nama_kegiatan || '-').toUpperCase();
    wsCover.getCell('D22').value = (project.program_name || project.nama_program || '-').toUpperCase();
    wsCover.getCell('D24').value = project.fiscal_year || project.tahun_anggaran || '-';
  }

  // 3. Sheet: HARGA SATUAN
  const wsHarga = workbook.getWorksheet('Harga Satuan') || workbook.getWorksheet('HARGA SATUAN');
  if (wsHarga) {
    clearDataRows(wsHarga, 6, 1000);
    let currentRow = 6;
    const groups = [
      { label: 'TENAGA KERJA', types: ['upah', 'tenaga'] },
      { label: 'BAHAN', types: ['bahan'] },
      { label: 'PERALATAN', types: ['alat', 'peralatan', 'mesin'] }
    ];
    groups.forEach(group => {
      const items = Object.values(resources).filter(r => group.types.some(t => r.jenis.includes(t)));
      if (items.length > 0) {
        currentRow++;
        wsHarga.getCell(`D${currentRow}`).value = group.label;
        wsHarga.getRow(currentRow).font = { bold: true };
        wsHarga.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        applyBorder(wsHarga, currentRow, 'B', 'I');
        currentRow++;
        items.forEach((r, idx) => {
          wsHarga.getCell(`B${currentRow}`).value = idx + 1;
          wsHarga.getCell(`D${currentRow}`).value = r.uraian;
          wsHarga.getCell(`E${currentRow}`).value = r.kode;
          wsHarga.getCell(`F${currentRow}`).value = r.satuan;
          wsHarga.getCell(`G${currentRow}`).value = r.harga;
          wsHarga.getCell(`G${currentRow}`).numFmt = '#,##0.00';
          wsHarga.getCell(`I${currentRow}`).value = Number(r.tkdn) / 100;
          wsHarga.getCell(`I${currentRow}`).numFmt = '0.00%';
          applyBorder(wsHarga, currentRow, 'B', 'I');
          currentRow++;
        });
      }
    });
    if (headerImageId) wsHarga.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
  }

  // 4. AHSP & HSP
  const wsAHSP = workbook.getWorksheet('ahsp') || workbook.getWorksheet('AHSP');
  const wsHSP = workbook.getWorksheet('hsp') || workbook.getWorksheet('HSP');
  if (wsAHSP || wsHSP) {
    if (wsAHSP) clearDataRows(wsAHSP, 6, 4000);
    if (wsHSP) clearDataRows(wsHSP, 6, 1000);
    let ahspRow = 6; let hspRow = 6;
    const grouped = {};
    enrichedLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'UMUM';
      if (!grouped[bab]) grouped[bab] = [];
      grouped[bab].push(line);
    });
    Object.entries(grouped).forEach(([babTitle, items], bIdx) => {
      if (wsHSP) {
        wsHSP.getCell(`C${hspRow}`).value = romanize(bIdx + 1);
        wsHSP.getCell(`D${hspRow}`).value = babTitle.toUpperCase();
        wsHSP.getRow(hspRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        applyBorder(wsHSP, hspRow, 'B', 'H');
        hspRow++;
      }
      if (wsAHSP) {
        wsAHSP.getCell(`B${ahspRow}`).value = romanize(bIdx + 1);
        wsAHSP.getCell(`C${ahspRow}`).value = babTitle.toUpperCase();
        wsAHSP.getRow(ahspRow).font = { bold: true };
        applyBorder(wsAHSP, ahspRow, 'B', 'N');
        ahspRow++;
      }
      items.forEach(line => {
        const itemCode = line.master_ahsp?.kode_ahsp || line.kode_ahsp || '-';
        if (wsHSP) {
          wsHSP.getCell(`B${hspRow}`).value = itemCode;
          wsHSP.getCell(`D${hspRow}`).value = line.uraian;
          wsHSP.getCell(`E${hspRow}`).value = line.satuan;
          wsHSP.getCell(`F${hspRow}`).value = Number(line.harga_satuan || 0);
          wsHSP.getCell(`F${hspRow}`).numFmt = '#,##0.00';
          wsHSP.getCell(`G${hspRow}`).value = Number(line.tkdn || 0) / 100;
          wsHSP.getCell(`G${hspRow}`).numFmt = '0.00%';
          applyBorder(wsHSP, hspRow, 'B', 'H');
          hspRow++;
        }
        if (wsAHSP) {
          const start = ahspRow;
          wsAHSP.getCell(`B${ahspRow}`).value = itemCode;
          wsAHSP.getCell(`D${ahspRow}`).value = (line.uraian || '-').toUpperCase();
          wsAHSP.getCell(`F${ahspRow}`).value = line.satuan;
          const prof = Number(line.profit_percent || line.profitPercent || globalOverhead);
          wsAHSP.getCell(`L${ahspRow}`).value = prof / 100;
          wsAHSP.getCell(`L${ahspRow}`).numFmt = '0.00%';
          applyBorder(wsAHSP, ahspRow, 'B', 'N');
          ahspRow++;
          const details = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || []);
          const cats = [
            { label: 'TENAGA KERJA', types: ['upah', 'tenaga'], col: 'I' },
            { label: 'BAHAN', types: ['bahan'], col: 'J' },
            { label: 'PERALATAN', types: ['alat', 'peralatan', 'mesin'], col: 'K' }
          ];
          cats.forEach(cat => {
            const filtered = details.filter(d => cat.types.some(t => (d.jenis_komponen || d.jenis || '').toLowerCase().includes(t)));
            if (filtered.length > 0) {
              wsAHSP.getCell(`D${ahspRow}`).value = cat.label;
              wsAHSP.getRow(ahspRow).font = { bold: true };
              applyBorder(wsAHSP, ahspRow, 'B', 'N');
              ahspRow++;
              filtered.forEach(d => {
                wsAHSP.getCell(`D${ahspRow}`).value = d.uraian;
                wsAHSP.getCell(`E${ahspRow}`).value = d.kode_item || d.kode;
                wsAHSP.getCell(`F${ahspRow}`).value = d.satuan;
                wsAHSP.getCell(`G${ahspRow}`).value = Number(d.koefisien || 0);
                wsAHSP.getCell(`H${ahspRow}`).value = Number(priceMap[d.kode_item] || d.harga_satuan_snapshot || d.harga_satuan || d.harga || 0);
                wsAHSP.getCell(`H${ahspRow}`).numFmt = '#,##0.00';
                wsAHSP.getCell(cat.col + ahspRow).value = { formula: `G${ahspRow}*H${ahspRow}` };
                wsAHSP.getCell(cat.col + ahspRow).numFmt = '#,##0.00';
                wsAHSP.getCell(`N${ahspRow}`).value = Number(d.tkdn || 0) / 100;
                wsAHSP.getCell(`N${ahspRow}`).numFmt = '0.00%';
                applyBorder(wsAHSP, ahspRow, 'B', 'N');
                ahspRow++;
              });
            }
          });
          wsAHSP.getCell(`I${start}`).value = { formula: `SUM(I${start+1}:I${ahspRow-1})` };
          wsAHSP.getCell(`J${start}`).value = { formula: `SUM(J${start+1}:J${ahspRow-1})` };
          wsAHSP.getCell(`K${start}`).value = { formula: `SUM(K${start+1}:K${ahspRow-1})` };
          wsAHSP.getCell(`M${start}`).value = { formula: `ROUND((I${start}+J${start}+K${start})*(1+L${start}), 0)` };
          wsAHSP.getCell(`M${start}`).numFmt = '#,##0.00';
          ahspRow++;
        }
      });
    });
    if (headerImageId) {
       if (wsAHSP) wsAHSP.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 14, row: 1 }, editAs: 'twoCell' });
       if (wsHSP) wsHSP.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
    }
  }

  // 5. RAB
  const wsRAB = workbook.getWorksheet('rab') || workbook.getWorksheet('RAB');
  if (wsRAB) {
    clearDataRows(wsRAB, 12, 1000);
    wsRAB.getCell('E7').value = (project.work_name || project.name || '-').toUpperCase();
    wsRAB.getCell('E8').value = (projectLocation || '-').toUpperCase();
    let rabRow = 12;
    const grouped = {};
    sortedLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'UMUM';
      if (!grouped[bab]) grouped[bab] = [];
      grouped[bab].push(line);
    });
    Object.entries(grouped).forEach(([babTitle, items], bIdx) => {
      wsRAB.getCell(`B${rabRow}`).value = romanize(bIdx + 1);
      wsRAB.getCell(`C${rabRow}`).value = babTitle.toUpperCase();
      wsRAB.getRow(rabRow).font = { bold: true };
      applyBorder(wsRAB, rabRow, 'B', 'K');
      rabRow++;
      const start = rabRow;
      items.forEach((line, iIdx) => {
        wsRAB.getCell(`B${rabRow}`).value = iIdx + 1;
        wsRAB.getCell(`C${rabRow}`).value = line.uraian;
        wsRAB.getCell(`F${rabRow}`).value = line.satuan;
        wsRAB.getCell(`G${rabRow}`).value = Number(line.volume || 0);
        wsRAB.getCell(`H${rabRow}`).value = Number(line.harga_satuan || 0);
        wsRAB.getCell(`I${rabRow}`).value = { formula: `G${rabRow}*H${rabRow}` };
        wsRAB.getCell(`J${rabRow}`).value = Number(line.tkdn || 0) / 100;
        wsRAB.getCell(`K${rabRow}`).value = { formula: `I${rabRow}*J${rabRow}` };
        wsRAB.getCell(`G${rabRow}`).numFmt = '#,##0.00';
        wsRAB.getCell(`H${rabRow}`).numFmt = '#,##0.00';
        wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
        wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%';
        wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
        applyBorder(wsRAB, rabRow, 'B', 'K');
        rabRow++;
      });
      wsRAB.getCell(`C${rabRow}`).value = `SUB TOTAL ${babTitle}`.toUpperCase();
      wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I${start}:I${rabRow-1})` };
      wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K${start}:K${rabRow-1})` };
      wsRAB.getRow(rabRow).font = { bold: true };
      wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
      wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
      applyBorder(wsRAB, rabRow, 'B', 'K');
      rabRow += 2;
    });
    const totalRow = rabRow;
    wsRAB.getCell(`C${totalRow}`).value = 'JUMLAH TOTAL';
    wsRAB.getCell(`I${totalRow}`).value = { formula: `SUM(I12:I${totalRow-1})/2` };
    wsRAB.getCell(`K${totalRow}`).value = { formula: `SUM(K12:K${totalRow-1})/2` };
    wsRAB.getRow(totalRow).font = { bold: true };
    wsRAB.getCell(`I${totalRow}`).numFmt = '#,##0.00';
    wsRAB.getCell(`K${totalRow}`).numFmt = '#,##0.00';
    applyBorder(wsRAB, totalRow, 'B', 'K');
    if (headerImageId) wsRAB.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 11, row: 1 }, editAs: 'twoCell' });
  }

  // 6. REKAP
  const wsRekap = workbook.getWorksheet('rekap rab') || workbook.getWorksheet('REKAP');
  if (wsRekap) {
    clearDataRows(wsRekap, 12, 100);
    wsRekap.getCell('E7').value = (project.work_name || project.name || '-').toUpperCase();
    wsRekap.getCell('E8').value = (projectLocation || '-').toUpperCase();
    let reRow = 12;
    const grouped = {};
    sortedLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'UMUM';
      if (!grouped[bab]) grouped[bab] = [];
      grouped[bab].push(line);
    });
    Object.keys(grouped).forEach((bab, idx) => {
      wsRekap.getCell(`B${reRow}`).value = String.fromCharCode(65 + idx);
      wsRekap.getCell(`C${reRow}`).value = bab.toUpperCase();
      wsRekap.getCell(`F${reRow}`).value = { formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${reRow}, 'rab'!C:K, 7, FALSE), 0)` };
      wsRekap.getCell(`G${reRow}`).value = { formula: `IFERROR(H${reRow}/F${reRow}, 0)` };
      wsRekap.getCell(`H${reRow}`).value = { formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${reRow}, 'rab'!C:K, 9, FALSE), 0)` };
      wsRekap.getCell(`F${reRow}`).numFmt = '#,##0.00';
      wsRekap.getCell(`G${rekapRow}`).numFmt = '0.00%';
      wsRekap.getCell(`H${reRow}`).numFmt = '#,##0.00';
      wsRekap.getRow(reRow).font = { bold: true };
      applyBorder(wsRekap, reRow, 'B', 'H');
      reRow++;
    });
    const sRow = reRow;
    wsRekap.getCell(`C${sRow}`).value = 'Jumlah Harga Pekerjaan';
    wsRekap.getCell(`F${sRow}`).value = { formula: `SUM(F12:F${sRow-1})` };
    wsRekap.getCell(`F${sRow}`).numFmt = '#,##0.00';
    applyBorder(wsRekap, sRow, 'B', 'H');
    const pRow = sRow + 1;
    wsRekap.getCell(`C${pRow}`).value = `PPN ${ppnPercent}%`;
    wsRekap.getCell(`F${pRow}`).value = { formula: `F${sRow}*${ppnPercent/100}` };
    wsRekap.getCell(`F${pRow}`).numFmt = '#,##0.00';
    applyBorder(wsRekap, pRow, 'B', 'H');
    const gRow = pRow + 1;
    wsRekap.getCell(`C${gRow}`).value = 'JUMLAH TOTAL HARGA PEKERJAAN';
    wsRekap.getCell(`F${gRow}`).value = { formula: `F${sRow}+F${pRow}` };
    wsRekap.getCell(`F${gRow}`).numFmt = '#,##0.00';
    wsRekap.getRow(gRow).font = { bold: true };
    applyBorder(wsRekap, gRow, 'B', 'H');
    if (headerImageId) wsRekap.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
  }

  // 7. SCHEDULE (FULL FROM BACKUP)
  if (selectedSheets.includes('schedule') || selectedSheets.includes('SCHEDULE') || selectedSheets.includes('Kurva-S')) {
    const wsSched = workbook.getWorksheet('schedule') || workbook.getWorksheet('SCHEDULE') || workbook.getWorksheet('Kurva-S');
    if (wsSched && scheduleData.length > 0) {
      clearDataRows(wsSched, 8, 500); 
      for (let r = 5; r <= 7; r++) { for (let c = 7; c <= 50; c++) { const cell = wsSched.getRow(r).getCell(c); cell.value = null; cell.style = {}; } }
      let minDate = new Date("2099-01-01"); let maxDate = new Date("2000-01-01");
      scheduleData.forEach(item => {
        if (item.seq_start) minDate = new Date(Math.min(minDate, new Date(item.seq_start)));
        if (item.seq_end) maxDate = new Date(Math.max(maxDate, new Date(item.seq_end)));
      });
      if (minDate > maxDate) { minDate = new Date(); maxDate = new Date(); maxDate.setDate(minDate.getDate() + 30); }
      minDate.setHours(0,0,0,0); maxDate.setHours(23,59,59,999);
      const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
      let totalWeeks = Math.ceil(totalDays / 7); if (totalWeeks < 1) totalWeeks = 1;
      wsSched.getCell('B3').value = `PEKERJAAN: ${project.work_name || project.name} (DURASI: ${totalWeeks} MINGGU / ${totalDays} HARI)`;
      wsSched.getCell('B3').font = { bold: true };
      const startCol = 7; const endCol = startCol + totalWeeks - 1;
      wsSched.mergeCells(5, startCol, 5, endCol); wsSched.getCell(5, startCol).value = "WAKTU PELAKSANAAN";
      wsSched.getCell(5, startCol).font = { bold: true }; wsSched.getCell(5, startCol).alignment = { horizontal: 'center', vertical: 'middle' };
      let currentMonth = -1; let monthStartCol = startCol; let mCount = 1; let iterDate = new Date(minDate);
      for (let w = 0; w < totalWeeks; w++) {
        const col = startCol + w;
        wsSched.getCell(7, col).value = `M${mCount}`; wsSched.getCell(7, col).alignment = { horizontal: 'center' };
        mCount++; if (mCount > 4) mCount = 1;
        const thisMonth = iterDate.getMonth(); if (currentMonth === -1) currentMonth = thisMonth;
        if (currentMonth !== thisMonth || w === totalWeeks - 1) {
          const endMerge = (currentMonth !== thisMonth) ? col - 1 : col;
          if (monthStartCol <= endMerge) {
            wsSched.mergeCells(6, monthStartCol, 6, endMerge);
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            wsSched.getCell(6, monthStartCol).value = monthNames[currentMonth]; wsSched.getCell(6, monthStartCol).alignment = { horizontal: 'center', vertical: 'middle' };
          }
          currentMonth = thisMonth; monthStartCol = col;
        }
        iterDate.setDate(iterDate.getDate() + 7);
      }
      const ketCol = endCol + 1; wsSched.getCell(5, ketCol).value = "KET"; wsSched.mergeCells(5, ketCol, 7, ketCol);
      const groupedSched = {}; scheduleData.forEach(item => { const bab = item.bab || 'I. PEKERJAAN PERSIAPAN'; if (!groupedSched[bab]) groupedSched[bab] = []; groupedSched[bab].push(item); });
      let currentRow = 8; let globalIdx = 0;
      const totalBabs = Object.keys(groupedSched).length; const totalItems = scheduleData.length;
      const tRow = 8 + totalBabs + totalItems + 1;
      const projectSubtotal = enrichedLines.reduce((acc, l) => acc + (Number(l.volume || 0) * Number(l.harga_satuan || 0)), 0) || 1;
      Object.entries(groupedSched).forEach(([babTitle, items], bIdx) => {
        wsSched.getCell(`B${currentRow}`).value = romanize(bIdx + 1); wsSched.getCell(`C${currentRow}`).value = babTitle.toUpperCase();
        wsSched.getRow(currentRow).font = { bold: true }; for (let i = 2; i <= ketCol; i++) wsSched.getCell(currentRow, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        currentRow++;
        items.forEach((item) => {
          globalIdx++; wsSched.getCell(`B${currentRow}`).value = globalIdx; wsSched.getCell(`C${currentRow}`).value = item.uraian;
          const itemTotalVal = Number(item.volume || 0) * Number(item.harga_satuan || 0); const itemBobotVal = itemTotalVal / projectSubtotal;
          wsSched.getCell(`D${currentRow}`).value = itemTotalVal; wsSched.getCell(`E${currentRow}`).value = itemBobotVal;
          wsSched.getCell(`D${currentRow}`).numFmt = '#,##0.00'; wsSched.getCell(`E${currentRow}`).numFmt = '0.00%';
          let itemStart = new Date(item.seq_start || minDate); let itemEnd = new Date(item.seq_end || itemStart);
          itemStart.setHours(0,0,0,0); itemEnd.setHours(23,59,59,999);
          const diffStartDays = Math.floor((itemStart - minDate) / (1000 * 60 * 60 * 24)); const startW = Math.max(0, Math.floor(diffStartDays / 7));
          const diffEndDays = Math.floor((itemEnd - minDate) / (1000 * 60 * 60 * 24)); const endW = Math.max(startW, Math.floor(diffEndDays / 7));
          const itemWeeksSpanned = endW - startW + 1;
          for(let w = 0; w < itemWeeksSpanned; w++) {
            const targetCol = startCol + startW + w;
            if (targetCol <= endCol) { wsSched.getCell(currentRow, targetCol).value = { formula: `IFERROR($E$${currentRow}/${itemWeeksSpanned}, 0)` }; wsSched.getCell(currentRow, targetCol).numFmt = '0.00%'; }
          }
          currentRow++;
        });
      });
      wsSched.getRow(currentRow).height = 5; currentRow++;
      wsSched.mergeCells(`B${tRow}:C${tRow}`); wsSched.getCell(`B${tRow}`).value = "JUMLAH"; wsSched.getCell(`B${tRow}`).alignment = { horizontal: 'right' };
      wsSched.getCell(`D${tRow}`).value = { formula: `SUM(D8:D${tRow-1})` }; wsSched.getCell(`E${tRow}`).value = { formula: `SUM(E8:E${tRow-1})` };
      wsSched.getCell(`D${tRow}`).numFmt = '#,##0.00'; wsSched.getCell(`E${tRow}`).numFmt = '0.00%';
      const rPM = tRow + 2; const kPM = tRow + 3; const aPM = tRow + 4; const kA  = tRow + 5; const dev = tRow + 6;
      [rPM, kPM, aPM, kA, dev].forEach(r => { wsSched.mergeCells(`B${r}:E${r}`); wsSched.getCell(`B${r}`).alignment = { horizontal: 'right' }; wsSched.getRow(r).font = { bold: true }; });
      wsSched.getCell(`B${rPM}`).value = "RENCANA PROGRESS MINGGUAN"; wsSched.getCell(`B${kPM}`).value = "KUMULATIF PROGRESS MINGGUAN";
      wsSched.getCell(`B${aPM}`).value = "AKTUAL PROGRESS MINGGUAN"; wsSched.getCell(`B${kA}`).value = "KUMULATIF PROGRESS AKTUAL"; wsSched.getCell(`B${dev}`).value = "DEVIASI";
      const weeklyActualMap = {};
      if (progressData.length > 0) {
        progressData.forEach(p => { const weekIdx = Math.floor(Number(p.day_number) / 7); const item = scheduleData.find(it => it.id === p.entity_id); if (item) { weeklyActualMap[weekIdx] = (weeklyActualMap[weekIdx] || 0) + ((Number(p.val || 0) * Number(item.harga_satuan || 0)) / projectSubtotal); } });
      }
      for (let c = startCol; c <= endCol; c++) {
        const colIdx = c - startCol; const colLetter = wsSched.getColumn(c).letter; const prevColLetter = wsSched.getColumn(c-1).letter;
        wsSched.getCell(`${colLetter}${rPM}`).value = { formula: `SUM(${colLetter}8:${colLetter}${tRow-1})` }; wsSched.getCell(`${colLetter}${rPM}`).numFmt = '0.00%';
        if (c === startCol) wsSched.getCell(`${colLetter}${kPM}`).value = { formula: `${colLetter}${rPM}` };
        else wsSched.getCell(`${colLetter}${kPM}`).value = { formula: `${prevColLetter}${kPM}+${colLetter}${rPM}` }; wsSched.getCell(`${colLetter}${kPM}`).numFmt = '0.00%';
        const actualVal = weeklyActualMap[colIdx] || 0; wsSched.getCell(`${colLetter}${aPM}`).value = actualVal > 0 ? actualVal : ""; wsSched.getCell(`${colLetter}${aPM}`).numFmt = '0.00%';
        if (c === startCol) wsSched.getCell(`${colLetter}${kA}`).value = { formula: `IF(${colLetter}${aPM}="","",${colLetter}${aPM})` };
        else wsSched.getCell(`${colLetter}${kA}`).value = { formula: `IF(${colLetter}${aPM}="","",${prevColLetter}${kA}+${colLetter}${aPM})` }; wsSched.getCell(`${colLetter}${kA}`).numFmt = '0.00%';
        wsSched.getCell(`${colLetter}${dev}`).value = { formula: `IF(${colLetter}${kA}="","",${colLetter}${kA}-${colLetter}${kPM})` }; wsSched.getCell(`${colLetter}${dev}`).numFmt = '0.00%';
      }
      for (let r = 5; r <= dev; r++) { if (r === tRow - 1 || r === tRow + 1) continue; for (let c = 2; c <= ketCol; c++) { wsSched.getRow(r).getCell(c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; } }
      if (headerImageId) wsSched.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      setupPrinter(wsSched, companyName, `A1:${wsSched.getColumn(endCol+1).letter}${dev+2}`, paperSize, 'landscape');
    }
  }

  // FINAL FILTERING
  const sheetNamesMap = {
    'COVER': ['Cover', 'COVER'],
    'RAB': ['RAB', 'rab'],
    'HSP': ['HSP', 'hsp'],
    'AHSP': ['AHSP', 'ahsp'],
    'HARGA SATUAN': ['Harga Satuan', 'HARGA SATUAN'],
    'REKAP': ['REKAP', 'rekap', 'rekap rab'],
    'schedule': ['schedule', 'SCHEDULE', 'Kurva-S']
  };
  const selectedSheetList = selectedSheets.flatMap(s => sheetNamesMap[s.toUpperCase()] || [s]);
  const worksheets = [...workbook.worksheets];
  worksheets.forEach(ws => {
    const isSelected = selectedSheetList.some(name => ws.name.toLowerCase() === name.toLowerCase());
    if (!isSelected) { workbook.removeWorksheet(ws.id); }
    else {
      // Setup printer for remaining sheets if not done inside
      if (!ws.pageSetup.printArea) setupPrinter(ws, companyName, null, paperSize);
    }
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `Laporan_Proyek_${project.work_name || project.name || 'Export'}.xlsx`;
  a.click(); window.URL.revokeObjectURL(url);
};

export { generateProjectReport };
