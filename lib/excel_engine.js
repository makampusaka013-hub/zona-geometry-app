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
  const ppnPercent = project?.ppn_percent ?? 12;
  const globalOverhead = project?.overhead_percent ?? 15;

  const { isCatalog = false, projectPrices = [], headerImage = null, paperSize = 'A4', scheduleData = [] } = options;
  const safeProjectPrices = Array.isArray(projectPrices) ? projectPrices : [];
  const priceMap = Object.fromEntries(safeProjectPrices.map(p => [p.kode_item, p.harga_satuan]));

  const response = await fetch(`/templates/master_template_custom.xlsx?v=${Date.now()}`);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  let headerImageId = null;
  if (headerImage) {
    try {
      let base64Murni = headerImage.includes(',') ? headerImage.split(',')[1] : headerImage;
      headerImageId = workbook.addImage({ base64: base64Murni, extension: 'png' });
    } catch (e) { console.error('Logo Error:', e); }
  }

  const sortedLines = [...ahspLines].sort((a, b) => {
    const wa = getBabWeight(a.bab_pekerjaan || a.bab);
    const wb = getBabWeight(b.bab_pekerjaan || b.bab);
    if (wa !== wb) return wa - wb;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  // Process Resources
  const resources = {};
  let totalProjectCost = 0;
  sortedLines.forEach(line => {
    const details = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || []);
    const rabVol = Number(line.volume || 0);
    details.forEach(d => {
      const itemCode = d.kode_item || d.kode || d.id;
      if (!itemCode) return;
      if (!resources[itemCode]) {
        resources[itemCode] = {
          kode: itemCode,
          uraian: d.uraian || '-',
          satuan: d.satuan || '-',
          harga: Number(priceMap[itemCode] || d.harga_satuan || 0),
          jenis: (d.jenis || 'bahan').toLowerCase(),
          tkdn: Number(d.tkdn || 0),
          totalVolume: 0
        };
      }
      resources[itemCode].totalVolume += Number(d.koefisien || 0) * rabVol;
    });
  });
  Object.values(resources).forEach(r => { totalProjectCost += r.totalVolume * r.harga; });

  // 1. COVER
  const wsCover = workbook.getWorksheet('Cover') || workbook.getWorksheet('COVER');
  if (wsCover) {
    wsCover.getCell('D14').value = (project.work_name || project.name || '-').toUpperCase();
    wsCover.getCell('D18').value = (projectLocation || '-').toUpperCase();
    wsCover.getCell('D20').value = (project.nama_kegiatan || project.activity_name || '-').toUpperCase();
    wsCover.getCell('D22').value = (project.nama_program || project.program_name || '-').toUpperCase();
    wsCover.getCell('D24').value = project.fiscal_year || '-';
  }

  // 2. HARGA SATUAN
  const wsHarga = workbook.getWorksheet('Harga Satuan') || workbook.getWorksheet('HARGA SATUAN');
  if (wsHarga) {
    clearDataRows(wsHarga, 6, 500);
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
    setupPrinter(wsHarga, companyName, 'A1:J' + currentRow, paperSize);
    if (headerImageId) wsHarga.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
  }

  // 3. AHSP & HSP
  const wsAHSP = workbook.getWorksheet('ahsp') || workbook.getWorksheet('AHSP');
  const wsHSP = workbook.getWorksheet('hsp') || workbook.getWorksheet('HSP');
  if (wsAHSP || wsHSP) {
    if (wsAHSP) clearDataRows(wsAHSP, 6, 2000);
    if (wsHSP) clearDataRows(wsHSP, 6, 500);
    let ahspRow = 6;
    let hspRow = 6;

    const grouped = {};
    sortedLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'UMUM';
      if (!grouped[bab]) grouped[bab] = [];
      grouped[bab].push(line);
    });

    Object.entries(grouped).forEach(([bab, items], bIdx) => {
      if (wsAHSP) {
        wsAHSP.getCell(`B${ahspRow}`).value = romanize(bIdx + 1);
        wsAHSP.getCell(`C${ahspRow}`).value = bab.toUpperCase();
        wsAHSP.getRow(ahspRow).font = { bold: true };
        applyBorder(wsAHSP, ahspRow, 'B', 'N');
        ahspRow++;
      }
      if (wsHSP) {
        wsHSP.getCell(`C${hspRow}`).value = romanize(bIdx + 1);
        wsHSP.getCell(`D${hspRow}`).value = bab.toUpperCase();
        wsHSP.getRow(hspRow).font = { bold: true };
        applyBorder(wsHSP, hspRow, 'B', 'H');
        hspRow++;
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
          wsAHSP.getCell(`D${ahspRow}`).value = line.uraian.toUpperCase();
          wsAHSP.getCell(`F${ahspRow}`).value = line.satuan;
          wsAHSP.getCell(`L${ahspRow}`).value = (Number(line.profit_percent || globalOverhead)) / 100;
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
            const filtered = details.filter(d => cat.types.some(t => (d.jenis || '').toLowerCase().includes(t)));
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
                wsAHSP.getCell(`H${ahspRow}`).value = Number(priceMap[d.kode_item] || d.harga_satuan || 0);
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
    if (wsAHSP) setupPrinter(wsAHSP, companyName, 'A1:N' + ahspRow, paperSize);
    if (wsHSP) setupPrinter(wsHSP, companyName, 'A1:I' + hspRow, paperSize);
    if (headerImageId) {
       if (wsAHSP) wsAHSP.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 14, row: 1 }, editAs: 'twoCell' });
       if (wsHSP) wsHSP.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
    }
  }

  // 4. RAB
  const wsRAB = workbook.getWorksheet('rab') || workbook.getWorksheet('RAB');
  if (wsRAB) {
    clearDataRows(wsRAB, 12, 500);
    wsRAB.getCell('E7').value = (project.work_name || project.name || '-').toUpperCase();
    wsRAB.getCell('E8').value = (projectLocation || '-').toUpperCase();
    let rabRow = 12;
    let grandTotal = 0;
    const grouped = {};
    sortedLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'UMUM';
      if (!grouped[bab]) grouped[bab] = [];
      grouped[bab].push(line);
    });

    Object.entries(grouped).forEach(([bab, items], bIdx) => {
      wsRAB.getCell(`B${rabRow}`).value = romanize(bIdx + 1);
      wsRAB.getCell(`C${rabRow}`).value = bab.toUpperCase();
      wsRAB.getRow(rabRow).font = { bold: true };
      applyBorder(wsRAB, rabRow, 'B', 'K');
      rabRow++;
      const start = rabRow;
      items.forEach((line, iIdx) => {
        const rowTotal = Number(line.volume || 0) * Number(line.harga_satuan || 0);
        grandTotal += rowTotal;
        wsRAB.getCell(`B${rabRow}`).value = iIdx + 1;
        wsRAB.getCell(`C${rabRow}`).value = line.uraian;
        wsRAB.getCell(`F${rabRow}`).value = line.satuan;
        wsRAB.getCell(`G${rabRow}`).value = Number(line.volume || 0);
        wsRAB.getCell(`H${rabRow}`).value = Number(line.harga_satuan || 0);
        wsRAB.getCell(`I${rabRow}`).value = { formula: `G${rabRow}*H${rabRow}`, result: rowTotal };
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
      wsRAB.getCell(`C${rabRow}`).value = `SUB TOTAL ${bab}`.toUpperCase();
      wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I${start}:I${rabRow-1})` };
      wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K${start}:K${rabRow-1})` };
      wsRAB.getRow(rabRow).font = { bold: true };
      wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
      wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
      applyBorder(wsRAB, rabRow, 'B', 'K');
      rabRow++;
      rabRow++;
    });

    const totalRow = rabRow;
    wsRAB.getCell(`C${totalRow}`).value = 'JUMLAH TOTAL';
    wsRAB.getCell(`I${totalRow}`).value = { formula: `SUM(I12:I${totalRow-1})/2` };
    wsRAB.getCell(`K${totalRow}`).value = { formula: `SUM(K12:K${totalRow-1})/2` };
    wsRAB.getRow(totalRow).font = { bold: true };
    wsRAB.getCell(`I${totalRow}`).numFmt = '#,##0.00';
    wsRAB.getCell(`K${totalRow}`).numFmt = '#,##0.00';
    applyBorder(wsRAB, totalRow, 'B', 'K');

    setupPrinter(wsRAB, companyName, 'B1:K' + (totalRow + 2), paperSize);
    if (headerImageId) wsRAB.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 11, row: 1 }, editAs: 'twoCell' });
  }

  // 5. REKAP
  const wsRekap = workbook.getWorksheet('rekap rab') || workbook.getWorksheet('REKAP');
  if (wsRekap) {
    clearDataRows(wsRekap, 12, 50);
    wsRekap.getCell('E7').value = (project.work_name || project.name || '-').toUpperCase();
    wsRekap.getCell('E8').value = (projectLocation || '-').toUpperCase();
    let rekapRow = 12;
    const grouped = {};
    sortedLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'UMUM';
      if (!grouped[bab]) grouped[bab] = [];
      grouped[bab].push(line);
    });

    Object.keys(grouped).forEach((bab, idx) => {
      wsRekap.getCell(`B${rekapRow}`).value = String.fromCharCode(65 + idx);
      wsRekap.getCell(`C${rekapRow}`).value = bab.toUpperCase();
      wsRekap.getCell(`F${rekapRow}`).value = { formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 7, FALSE), 0)` };
      wsRekap.getCell(`G${rekapRow}`).value = { formula: `IFERROR(H${rekapRow}/F${rekapRow}, 0)` };
      wsRekap.getCell(`H${rekapRow}`).value = { formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 9, FALSE), 0)` };
      wsRekap.getCell(`F${rekapRow}`).numFmt = '#,##0.00';
      wsRekap.getCell(`G${rekapRow}`).numFmt = '0.00%';
      wsRekap.getCell(`H${rekapRow}`).numFmt = '#,##0.00';
      wsRekap.getRow(rekapRow).font = { bold: true };
      applyBorder(wsRekap, rekapRow, 'B', 'H');
      rekapRow++;
    });

    const sumRow = rekapRow;
    wsRekap.getCell(`C${sumRow}`).value = 'Jumlah Harga Pekerjaan';
    wsRekap.getCell(`F${sumRow}`).value = { formula: `SUM(F12:F${sumRow-1})` };
    wsRekap.getCell(`F${sumRow}`).numFmt = '#,##0.00';
    applyBorder(wsRekap, sumRow, 'B', 'H');

    const ppnRow = sumRow + 1;
    wsRekap.getCell(`C${ppnRow}`).value = `PPN ${ppnPercent}%`;
    wsRekap.getCell(`F${ppnRow}`).value = { formula: `F${sumRow}*${ppnPercent/100}` };
    wsRekap.getCell(`F${ppnRow}`).numFmt = '#,##0.00';
    applyBorder(wsRekap, ppnRow, 'B', 'H');

    const grandRow = ppnRow + 1;
    wsRekap.getCell(`C${grandRow}`).value = 'JUMLAH TOTAL HARGA PEKERJAAN';
    wsRekap.getCell(`F${grandRow}`).value = { formula: `F${sumRow}+F${ppnRow}` };
    wsRekap.getCell(`F${grandRow}`).numFmt = '#,##0.00';
    wsRekap.getRow(grandRow).font = { bold: true };
    applyBorder(wsRekap, grandRow, 'B', 'H');

    setupPrinter(wsRekap, companyName, 'B1:H' + (grandRow + 5), paperSize);
    if (headerImageId) wsRekap.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
  }

  // 6. SCHEDULE
  const wsSched = workbook.getWorksheet('schedule') || workbook.getWorksheet('Kurva-S');
  if (wsSched && scheduleData.length > 0) {
    clearDataRows(wsSched, 8, 200);
    // [Minimal schedule logic]
    setupPrinter(wsSched, companyName, 'A1:AZ50', paperSize, 'landscape');
  }

  // FINAL FILTER: Keep only selected sheets
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
    if (!isSelected) {
      workbook.removeWorksheet(ws.id);
    }
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laporan_RAB_${project.name || 'Export'}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

export { generateProjectReport };
