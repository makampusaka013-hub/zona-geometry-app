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
      cell.border = {
        top: { style: 'none' },
        left: { style: 'none' },
        bottom: { style: 'none' },
        right: { style: 'none' }
      };
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
    if (cell.value === ",..," || cell.value === ",..") continue;
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  }
};

const setupPrinter = (ws, companyName, printArea = null, paperSize = 'A4', orientation = 'portrait') => {
  if (!ws) return;
  const pSize = paperSize === 'F4' ? 13 : 9;
  ws.pageSetup = {
    paperSize: pSize,
    orientation: orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '5:5',
    margins: { left: 0.78, right: 0.25, top: 0.25, bottom: 0.39, header: 0, footer: 0.2 }
  };
  if (printArea) ws.pageSetup.printArea = printArea;
  ws.headerFooter = { oddHeader: '', oddFooter: `&L&8By : &"Arial,Bold"&KFF8C00ZG &R&8&P / &N` };
};

const getBabWeight = (bab) => {
  if (!bab) return 999;
  const s = String(bab).trim().toUpperCase();
  const m = s.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)/);
  if (!m) return 998;
  const roman = m[1];
  const map = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10, XI:11, XII:12, XIII:13, XIV:14, XV:15 };
  return map[roman] || 997;
};

async function fillExcelData(workbook, project, user, ahspLines, selectedSheets, options = {}) {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const projectLocation = project.location || project.address || '-';
  const ppnPercent = project?.ppn_percent ?? 12;
  const { isCatalog = false, projectPrices = [], headerImageId = null, paperSize = 'A4' } = options;
  const priceMap = Object.fromEntries(projectPrices.map(p => [p.kode_item, p.harga_satuan]));

  const sortedLines = [...ahspLines].sort((a, b) => {
    const wa = getBabWeight(a.bab_pekerjaan || a.bab);
    const wb = getBabWeight(b.bab_pekerjaan || b.bab);
    if (wa !== wb) return wa - wb;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  // --- Implementation of each sheet logic ---
  // (Simplified for now, would contain the full logic from excel_engine.js)
  
  if (selectedSheets.includes('cover')) {
     const ws = workbook.getWorksheet('COVER') || workbook.getWorksheet('Cover');
     if (ws) {
        ws.getCell('D10').value = (project.name || '').toUpperCase();
        ws.getCell('D12').value = (project.location || '').toUpperCase();
        ws.getCell('D14').value = project.fiscal_year || '-';
        ws.getCell('D16').value = companyName.toUpperCase();
     }
  }

  // RAB, REKAP, AHSP, HSP logic goes here...
  // ...
  
  return workbook;
}

module.exports = {
  fillExcelData,
  romanize,
  formatTerbilang,
  getBabWeight
};
