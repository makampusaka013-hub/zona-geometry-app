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

// Fungsi clearDataRows telah diperbaiki secara radikal
const clearDataRows = (ws, startRow, count) => {
  for (let i = 0; i < count; i++) {
    const row = ws.getRow(startRow + i);
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      // Hapus style lama dengan aman sebelum menimpa border
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
  
  const pSize = paperSize === 'F4' ? 13 : 9; // 13 = Folio/F4, 9 = A4

  ws.pageSetup = {
    paperSize: pSize,
    orientation: orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '5:5', // Header baris 5 mengulang di setiap halaman
    margins: {
      left: 0.78,    // 2 cm
      right: 0.25,   // 0.64 cm
      top: 0.25,     // 0.64 cm
      bottom: 0.39,  // 1 cm (untuk catatan kaki)
      header: 0,
      footer: 0.2
    }
  };

  if (printArea) {
    ws.pageSetup.printArea = printArea;
  }

  if (!ws.headerFooter) {
    ws.headerFooter = { oddHeader: '', oddFooter: '' };
  }

  // Header dihapus sesuai permintaan
  ws.headerFooter.oddHeader = '';

  // Footer Dinamis: Kiri (Branding) & Kanan (Halaman)
  // Gunakan &10 agar teks tetap terbaca meski sheet diskalakan
  ws.headerFooter.oddFooter = `&L&8By : &"Arial,Bold"&KFF8C00ZG &R&8&P / &N`;
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

const generateProjectReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const projectLocation = project.location || project.address || '-';
  const ppnPercent = project?.ppn_percent ?? project?.ppn ?? 11;
  const globalOverhead = project?.profit_percent ?? project?.overhead_percent ?? 15;

  const { 
    isCatalog = false, 
    projectPrices = [], 
    headerImage = null, 
    paperSize = 'A4',
    isStandalone = false,
    scheduleData = [],
    progressData = []
  } = options;
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

  // Sinkronkan urutan: Berdasarkan Berat BAB (I, II, III...) lalu sort_order
  const sortedLines = [...ahspLines].sort((a, b) => {
    const wa = getBabWeight(a.bab_pekerjaan || a.bab);
    const wb = getBabWeight(b.bab_pekerjaan || b.bab);
    if (wa !== wb) return wa - wb;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const enrichedLines = sortedLines;

  // ==========================================
  // 1. Process Resources
  // ==========================================
  const resources = {};
  let totalProjectCostForPercent = 0;

  // Calculate usage
  if (Array.isArray(enrichedLines)) {
    enrichedLines.forEach(line => {
      const details = isCatalog ? 
        (line.details || []) : 
        (line.master_ahsp?.details || line.analisa_custom || line.details || []);
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
  }

  Object.values(resources).forEach(r => { totalProjectCostForPercent += r.totalVolume * r.harga; });

  // 1a. Sheet: Harga Satuan (Simple / Master List)
  const wsHarga = workbook.getWorksheet('Harga Satuan') || workbook.getWorksheet('HARGA SATUAN') || workbook.getWorksheet('harga satuan');
  if (wsHarga) {
    clearDataRows(wsHarga, 6, 1000);
    const groups = [
      { label: 'TENAGA KERJA', prefixes: ['L'] },
      { label: 'BAHAN', prefixes: ['A', 'B'] },
      { label: 'PERALATAN', prefixes: ['M'] }
    ];
    // Border baris 6 (Header) menyambung B sampai I
    for (let i = 2; i <= 9; i++) {
      wsHarga.getCell(6, i).border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: i === 2 ? { style: 'thin' } : undefined,
        right: i === 9 ? { style: 'thin' } : undefined
      };
    }
    groups.forEach(group => {
      const items = Object.values(resources).filter(r => {
        const code = (r.kode || '').toUpperCase();
        return group.prefixes.some(p => code.startsWith(p));
      });
      if (items.length > 0) {
        currentRow++;
        const headerCell = wsHarga.getCell(`D${currentRow}`);
        headerCell.value = group.label;
        wsHarga.getRow(currentRow).font = { bold: true };
        wsHarga.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        
        // Tambal lubang di kolom C
        for (let i = 3; i <= 9; i++) {
          const cell = wsHarga.getRow(currentRow).getCell(i);
          cell.border = { 
            top: { style: 'thin' }, 
            bottom: { style: 'thin' },
            right: (i === 9) ? { style: 'thin' } : undefined
          };
        }
        wsHarga.getCell(`B${currentRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        currentRow++;
        items.forEach((r, idx) => {
          wsHarga.getCell(`B${currentRow}`).value = idx + 1;
          wsHarga.getCell(`B${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
          wsHarga.getCell(`D${currentRow}`).value = r.uraian;
          wsHarga.getCell(`E${currentRow}`).value = r.kode;
          wsHarga.getCell(`E${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
          wsHarga.getCell(`F${currentRow}`).value = r.satuan;
          wsHarga.getCell(`F${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
          wsHarga.getCell(`G${currentRow}`).value = Number(r.harga);
          wsHarga.getCell(`G${currentRow}`).numFmt = '#,##0.00';
          wsHarga.getCell(`I${currentRow}`).value = Number(r.tkdn) / 100;
          wsHarga.getCell(`I${currentRow}`).numFmt = '0.00%';
          applyBorder(wsHarga, currentRow, 'B', 'I');
          currentRow++;
        });
      }
    });
    if (headerImageId !== null) {
      wsHarga.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
    }
  }

  // 1b. Sheet: Harga Satuan Terpakai (REMOVED - Redundant)

  // ==========================================
  // 2. Process HSP & AHSP
  // ==========================================
  let hspRow = 6;
  let ahspRow = 6;
  const wsHSP = workbook.getWorksheet('hsp') || workbook.getWorksheet('HSP');
  const wsAHSP = workbook.getWorksheet('ahsp') || workbook.getWorksheet('AHSP');

  if (wsHSP) clearDataRows(wsHSP, 6, 1000);
  if (wsAHSP) clearDataRows(wsAHSP, 6, 5000);

  const groupedItems = {};
  enrichedLines.forEach(line => {
    const bab = line.bab_pekerjaan || line.divisi || 'I. PEKERJAAN PERSIAPAN';
    const subBab = line.sub_bab || '';
    const category = line.kategori || line.kategori_pekerjaan || '';
    if (!groupedItems[bab]) groupedItems[bab] = {};
    if (!groupedItems[bab][subBab]) groupedItems[bab][subBab] = {};
    if (!groupedItems[bab][subBab][category]) groupedItems[bab][subBab][category] = [];
    groupedItems[bab][subBab][category].push(line);
  });

  Object.entries(groupedItems).forEach(([babTitle, subBabs], bIdx) => {
    if (wsHSP) {
      wsHSP.getCell(`C${hspRow}`).value = romanize(bIdx + 1);
      wsHSP.getCell(`D${hspRow}`).value = (babTitle || '-').toUpperCase();
      wsHSP.getRow(hspRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
      applyBorder(wsHSP, hspRow, 'B', 'H');
      hspRow++;
    }
    if (wsAHSP) {
      wsAHSP.getCell(`B${ahspRow}`).value = romanize(bIdx + 1);
      wsAHSP.getCell(`C${ahspRow}`).value = (babTitle || '-').toUpperCase();
      wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: '1E3A8A' }, bold: true };
      for (let i = 3; i <= 14; i++) wsAHSP.getRow(ahspRow).getCell(i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: (i === 14) ? { style: 'thin' } : undefined };
      wsAHSP.getCell(`B${ahspRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      ahspRow++;
    }
    Object.entries(subBabs).forEach(([subTitle, categories]) => {
      if (subTitle) {
        if (wsHSP) { wsHSP.getCell(`D${hspRow}`).value = (subTitle || '-').toUpperCase(); applyBorder(wsHSP, hspRow, 'B', 'H'); hspRow++; }
        if (wsAHSP) { ahspRow++; wsAHSP.getCell(`C${ahspRow}`).value = (subTitle || '-').toUpperCase(); wsAHSP.getCell(`C${ahspRow}`).font = { bold: true }; for (let i = 3; i <= 14; i++) wsAHSP.getRow(ahspRow).getCell(i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: (i === 14) ? { style: 'thin' } : undefined }; ahspRow++; }
      }
      Object.entries(categories).forEach(([catTitle, items]) => {
        if (catTitle) {
          if (wsHSP) { wsHSP.getCell(`D${hspRow}`).value = (catTitle || '-').toUpperCase(); applyBorder(wsHSP, hspRow, 'B', 'H'); hspRow++; }
          if (wsAHSP) { ahspRow++; wsAHSP.getCell(`C${ahspRow}`).value = (catTitle || '-').toUpperCase(); wsAHSP.getCell(`C${ahspRow}`).font = { bold: true }; for (let i = 3; i <= 14; i++) wsAHSP.getRow(ahspRow).getCell(i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: (i === 14) ? { style: 'thin' } : undefined }; ahspRow++; }
        }
        items.forEach((line) => {
          const itemCode = isCatalog ? line.kode_ahsp : (line.master_ahsp?.kode_ahsp || '-');
          if (wsHSP) {
            wsHSP.getCell(`B${hspRow}`).value = itemCode;
            const uV = line.uraian || line.nama_pekerjaan; const sV = line.satuan || line.satuan_pekerjaan; const hV = Number(line.harga_satuan || line.total_subtotal || 0); const tV = Number(line.tkdn || line.total_tkdn_percent || 100) / 100;
            if (isStandalone) { wsHSP.getCell(`D${hspRow}`).value = uV; wsHSP.getCell(`E${hspRow}`).value = sV; wsHSP.getCell(`F${hspRow}`).value = hV; wsHSP.getCell(`G${hspRow}`).value = tV; }
            else { wsHSP.getCell(`D${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 3, FALSE), "")`, result: uV }; wsHSP.getCell(`E${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:F, 5, FALSE), "")`, result: sV }; wsHSP.getCell(`F${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 12, FALSE), "")`, result: hV }; wsHSP.getCell(`G${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 13, FALSE), "")`, result: tV }; }
            wsHSP.getCell(`E${hspRow}`).alignment = { vertical: 'middle', horizontal: 'center' }; wsHSP.getCell(`F${hspRow}`).numFmt = '#,##0.00'; wsHSP.getCell(`G${hspRow}`).numFmt = '0.00%'; applyBorder(wsHSP, hspRow, 'B', 'H'); hspRow++;
          }
          if (wsAHSP) {
            const mH = ahspRow; wsAHSP.getCell(`B${mH}`).value = itemCode; wsAHSP.getCell(`D${mH}`).value = ((line.uraian || line.nama_pekerjaan || '-') + "").toUpperCase(); wsAHSP.getCell(`F${mH}`).value = line.satuan || line.satuan_pekerjaan;
            const dFP = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || []);
            let cB = 0; dFP.forEach(d => { cB += (Number(d.koefisien || 0) * Number(d.harga_satuan_snapshot || d.harga_satuan || d.harga || priceMap[d.kode_item || d.kode || d.id] || 0)); });
            let sP = globalOverhead; if (line.profit_percent !== null && line.profit_percent !== undefined) sP = Number(line.profit_percent); else if (line.profitPercent !== null && line.profitPercent !== undefined) sP = Number(line.profitPercent); else if (cB > 0 && Number(line.harga_satuan) > 0) sP = Math.round(((Number(line.harga_satuan) / cB) - 1) * 100);
            wsAHSP.getCell(`L${mH}`).value = sP / 100; wsAHSP.getCell(`L${mH}`).numFmt = '0.00%'; wsAHSP.getCell(mH, 2).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            for (let i = 3; i <= 8; i++) { const cell = wsAHSP.getCell(mH, i); if (i === 6) { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; cell.alignment = { vertical: 'middle', horizontal: 'center' }; } else { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: (i === 5 || i === 8) ? { style: 'thin' } : undefined }; } }
            for (let i = 9; i <= 14; i++) wsAHSP.getCell(mH, i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            ahspRow++; const sDR = ahspRow; const details = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || []);
            const aCs = [
              { label: 'TENAGA KERJA', prefixes: ['L'] }, 
              { label: 'BAHAN', prefixes: ['A', 'B'] }, 
              { label: 'PERALATAN', prefixes: ['M'] }
            ];
            aCs.forEach(cat => {
              const filtered = details.filter(d => {
                const code = (d.kode_item || d.kode || '').toUpperCase();
                return cat.prefixes.some(p => code.startsWith(p));
              });
              if (filtered.length > 0) {
                wsAHSP.getCell(`B${ahspRow}`).value = cat.label.charAt(0); wsAHSP.getCell(`D${ahspRow}`).value = cat.label;
                for (let i = 3; i <= 14; i++) wsAHSP.getRow(ahspRow).getCell(i).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: (i === 14) ? { style: 'thin' } : undefined };
                wsAHSP.getCell(`B${ahspRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                ahspRow++;
                filtered.forEach((d) => {
                  const k = Number(d.koefisien || 0); const iP = Number(d.harga_satuan_snapshot || d.harga_satuan || d.harga || priceMap[d.kode_item] || 0);
                  wsAHSP.getCell(`D${ahspRow}`).value = d.uraian; wsAHSP.getCell(`E${ahspRow}`).value = d.kode_item || d.kode; wsAHSP.getCell(`E${ahspRow}`).alignment = { horizontal: 'center' }; wsAHSP.getCell(`F${ahspRow}`).value = d.satuan; wsAHSP.getCell(`F${ahspRow}`).alignment = { horizontal: 'center' }; wsAHSP.getCell(`G${ahspRow}`).value = k;
                  if (isStandalone) wsAHSP.getCell(`H${ahspRow}`).value = iP; else wsAHSP.getCell(`H${ahspRow}`).value = { formula: `IFERROR(VLOOKUP(E${ahspRow}, 'Harga Satuan'!E:G, 3, FALSE), "")`, result: iP };
                  wsAHSP.getCell(`H${ahspRow}`).numFmt = '#,##0.00'; const sF = { formula: `G${ahspRow}*H${ahspRow}`, result: k * iP };
                  if (cat.label === 'TENAGA KERJA') wsAHSP.getCell(`I${ahspRow}`).value = sF; else if (cat.label === 'BAHAN') wsAHSP.getCell(`J${ahspRow}`).value = sF; else wsAHSP.getCell(`K${ahspRow}`).value = sF;
                  wsAHSP.getCell(`I${ahspRow}`).numFmt = '#,##0.00'; wsAHSP.getCell(`J${ahspRow}`).numFmt = '#,##0.00'; wsAHSP.getCell(`K${ahspRow}`).numFmt = '#,##0.00'; wsAHSP.getCell(`N${ahspRow}`).value = Number(d.tkdn || 0) / 100; wsAHSP.getCell(`N${ahspRow}`).numFmt = '0.00%'; applyBorder(wsAHSP, ahspRow, 'B', 'N'); ahspRow++;
                });
              }
            });
            const eDR = ahspRow - 1;
            if (sDR <= eDR) { wsAHSP.getCell(`I${mH}`).value = { formula: `SUM(I${sDR}:I${eDR})`, result: 0 }; wsAHSP.getCell(`J${mH}`).value = { formula: `SUM(J${sDR}:J${eDR})`, result: 0 }; wsAHSP.getCell(`K${mH}`).value = { formula: `SUM(K${sDR}:K${eDR})`, result: 0 }; }
            wsAHSP.getCell(`I${mH}`).numFmt = '#,##0.00'; wsAHSP.getCell(`J${mH}`).numFmt = '#,##0.00'; wsAHSP.getCell(`K${mH}`).numFmt = '#,##0.00'; wsAHSP.getCell(`M${mH}`).value = { formula: `ROUND((I${mH}+J${mH}+K${mH})*(1+L${mH}), 0)`, result: 0 }; wsAHSP.getCell(`M${mH}`).numFmt = '#,##0.00';
            if (sDR <= eDR) wsAHSP.getCell(`N${mH}`).value = { formula: `AVERAGE(N${sDR}:N${eDR})`, result: 0 }; else wsAHSP.getCell(`N${mH}`).value = Number(line.tkdn || 0) / 100;
            wsAHSP.getCell(`N${mH}`).numFmt = '0.00%'; ahspRow++;
          }
        });
      });
    });
  });

  if (headerImageId !== null) {
    if (wsAHSP) wsAHSP.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 14, row: 1 }, editAs: 'twoCell' });
    if (wsHSP) wsHSP.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
  }

  // ==========================================
  // 3. Process RAB
  // ==========================================
  const wsRAB = workbook.getWorksheet('rab') || workbook.getWorksheet('RAB');
  if (wsRAB) {
    clearDataRows(wsRAB, 12, 1000);
    wsRAB.getCell('E4').value = (project?.nama_program || project?.program || project?.program_name || '-').toUpperCase();
    wsRAB.getCell('E5').value = (project?.nama_kegiatan || project?.kegiatan || project?.activity_name || '-').toUpperCase();
    wsRAB.getCell('E7').value = (project?.work_name || project?.name || '-').toUpperCase();
    wsRAB.getCell('E8').value = (projectLocation || '-').toUpperCase();
    wsRAB.getCell('E9').value = project?.tahun_anggaran || project?.fiscal_year || '2026';

    const applyRabBorder = (rowNum, type = 'item') => {
      const row = wsRAB.getRow(rowNum);
      for (let i = 2; i <= 11; i++) {
        const col = String.fromCharCode(64 + i); const cell = row.getCell(i);
        if (type === 'bab') { if (col === 'B') cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; else if (i >= 3 && i <= 10) cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }; else if (col === 'K') cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; }
        else if (type === 'total') { if (col === 'B') cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; else if (i >= 3 && i <= 8) cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }; else cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; }
        else { if (['C', 'D', 'E'].includes(col)) cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }; else cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; }
      }
    };

    let rabRow = 12; const groupedRAB = {};
    enrichedLines.forEach(line => { const bab = line.bab_pekerjaan || 'I. PEKERJAAN PERSIAPAN'; if (!groupedRAB[bab]) groupedRAB[bab] = []; groupedRAB[bab].push(line); });
    Object.entries(groupedRAB).forEach(([babTitle, items], bIdx) => {
      wsRAB.getCell(`B${rabRow}`).value = romanize(bIdx + 1); wsRAB.getCell(`C${rabRow}`).value = babTitle.toUpperCase(); wsRAB.getRow(rabRow).font = { bold: true }; applyRabBorder(rabRow, 'bab'); rabRow++;
      const startBabRow = rabRow;
      items.forEach((line, iIdx) => {
        wsRAB.getCell(`B${rabRow}`).value = iIdx + 1; wsRAB.getCell(`C${rabRow}`).value = line.uraian; wsRAB.getCell(`F${rabRow}`).value = line.satuan; wsRAB.getCell(`G${rabRow}`).value = Number(line.volume || 0);
        if (isStandalone) { wsRAB.getCell(`H${rabRow}`).value = Number(line.harga_satuan || 0); wsRAB.getCell(`J${rabRow}`).value = Number(line.tkdn || 0) / 100; }
        else { wsRAB.getCell(`H${rabRow}`).value = { formula: `IFERROR(VLOOKUP(C${rabRow}, 'hsp'!D:F, 3, FALSE), 0)`, result: Number(line.harga_satuan || 0) }; wsRAB.getCell(`J${rabRow}`).value = { formula: `IFERROR(VLOOKUP(C${rabRow}, 'hsp'!D:G, 4, FALSE), 0)`, result: Number(line.tkdn || 0) / 100 }; }
        wsRAB.getCell(`I${rabRow}`).value = { formula: `G${rabRow}*H${rabRow}`, result: Number(line.volume || 0) * Number(line.harga_satuan || 0) }; wsRAB.getCell(`K${rabRow}`).value = { formula: `I${rabRow}*J${rabRow}`, result: Number(line.volume || 0) * Number(line.harga_satuan || 0) * (Number(line.tkdn || 0) / 100) };
        wsRAB.getCell(`G${rabRow}`).numFmt = '#,##0.00'; wsRAB.getCell(`H${rabRow}`).numFmt = '#,##0.00'; wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00'; wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%'; wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
        applyRabBorder(rabRow, 'item'); rabRow++;
      });
      const endBabRow = rabRow - 1;
      wsRAB.getCell(`C${rabRow}`).value = `SUB TOTAL ${babTitle}`.toUpperCase(); wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I${startBabRow}:I${endBabRow})`, result: 0 }; wsRAB.getCell(`J${rabRow}`).value = { formula: `IFERROR(K${rabRow}/I${rabRow}, 0)`, result: 0 }; wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K${startBabRow}:K${endBabRow})`, result: 0 };
      wsRAB.getRow(rabRow).font = { bold: true }; wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00'; wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%'; wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00'; applyRabBorder(rabRow, 'total');
      rabRow += 2;
    });
    wsRAB.getCell(`C${rabRow}`).value = 'JUMLAH TOTAL'; wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I12:I${rabRow-1})/2`, result: 0 }; wsRAB.getCell(`J${rabRow}`).value = { formula: `IFERROR(K${rabRow}/I${rabRow}, 0)`, result: 0 }; wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K12:K${rabRow-1})/2`, result: 0 };
    wsRAB.getRow(rabRow).font = { bold: true }; wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00'; wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%'; wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00'; applyRabBorder(rabRow, 'total');
    if (headerImageId) wsRAB.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 11, row: 1 }, editAs: 'twoCell' });
  }

  // ==========================================
  // 4. Process REKAP
  // ==========================================
  const wsRekap = workbook.getWorksheet('rekap rab') || workbook.getWorksheet('REKAP');
  if (wsRekap) {
    clearDataRows(wsRekap, 12, 100);
    wsRekap.getCell('E4').value = (project?.nama_program || project?.program || project?.program_name || '-').toUpperCase();
    wsRekap.getCell('E5').value = (project?.nama_kegiatan || project?.kegiatan || project?.activity_name || '-').toUpperCase();
    wsRekap.getCell('E7').value = (project?.work_name || project?.name || '-').toUpperCase();
    wsRekap.getCell('E8').value = (projectLocation || '-').toUpperCase();
    wsRekap.getCell('E9').value = project?.tahun_anggaran || project?.fiscal_year || '2026';

    let rekapRow = 12; const groupedRekap = {}; enrichedLines.forEach(line => { const bab = line.bab_pekerjaan || 'I. PEKERJAAN PERSIAPAN'; if (!groupedRekap[bab]) groupedRekap[bab] = []; groupedRekap[bab].push(line); });
    let indexAlfabet = 0;
    Object.keys(groupedRekap).forEach((babTitle) => {
      wsRekap.getCell(`B${rekapRow}`).value = String.fromCharCode(65 + indexAlfabet); wsRekap.getCell(`C${rekapRow}`).value = babTitle.toUpperCase();
      wsRekap.getCell(`F${rekapRow}`).value = { formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 7, FALSE), 0)` }; wsRekap.getCell(`G${rekapRow}`).value = { formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 8, FALSE), 0)` }; wsRekap.getCell(`H${rekapRow}`).value = { formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 9, FALSE), 0)` };
      wsRekap.getCell(`F${rekapRow}`).numFmt = '#,##0.00'; wsRekap.getCell(`G${rekapRow}`).numFmt = '0.00%'; wsRekap.getCell(`H${rekapRow}`).numFmt = '#,##0.00'; wsRekap.getRow(rekapRow).font = { bold: true };
      ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => { const cell = wsRekap.getCell(`${col}${rekapRow}`); if (col === 'C' || col === 'D' || col === 'E') cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }; else cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
      rekapRow++; indexAlfabet++;
    });
    const endDataRow = rekapRow - 1; wsRekap.getRow(rekapRow).height = 5; wsRekap.getCell(`B${rekapRow}`).border = { left: { style: 'thin' } }; wsRekap.getCell(`H${rekapRow}`).border = { right: { style: 'thin' } }; rekapRow++;
    const totalRow = rekapRow; wsRekap.getCell(`C${totalRow}`).value = 'Jumlah Harga Pekerjaan ( termasuk Biaya Umum dan Keuntungan )'; wsRekap.getCell(`F${totalRow}`).value = { formula: `SUM(F12:F${endDataRow})` };
    const ppnRow = rekapRow + 1; wsRekap.getCell(`C${ppnRow}`).value = `( Pajak Pertambahan Nilai ( PPN ) = ${ppnPercent}% )`; wsRekap.getCell(`F${ppnRow}`).value = { formula: `F${totalRow}*${ppnPercent/100}` };
    const grandRow = rekapRow + 2; wsRekap.getCell(`C${grandRow}`).value = 'JUMLAH TOTAL HARGA PEKERJAAN'; wsRekap.getCell(`F${grandRow}`).value = { formula: `F${totalRow}+F${ppnRow}` };
    for(let r = totalRow; r <= grandRow; r++) { wsRekap.getCell(`F${r}`).numFmt = '#,##0.00'; wsRekap.getRow(r).font = { bold: true }; ['B','C','D','E','F','G','H'].forEach(col => { const cell = wsRekap.getCell(`${col}${r}`); if (col === 'C' || col === 'D' || col === 'E') cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }; else cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; }); }
    if (headerImageId) wsRekap.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
  }

  // ==========================================
  // 5. Process Schedule
  // ==========================================
  const wsSched = workbook.getWorksheet('schedule') || workbook.getWorksheet('SCHEDULE') || workbook.getWorksheet('Kurva-S');
  if (wsSched && Array.isArray(scheduleData) && scheduleData.length > 0) {
    clearDataRows(wsSched, 8, 500); for (let r = 5; r <= 7; r++) { for (let c = 7; c <= 50; c++) { const cell = wsSched.getRow(r).getCell(c); cell.value = null; cell.style = {}; } }
    let minD = new Date("2099-01-01"); let maxD = new Date("2000-01-01"); scheduleData.forEach(item => { if (item.seq_start) minD = new Date(Math.min(minD, new Date(item.seq_start))); if (item.seq_end) maxD = new Date(Math.max(maxD, new Date(item.seq_end))); });
    if (minD > maxD) { minD = new Date(); maxD = new Date(); maxD.setDate(minD.getDate() + 30); }
    minD.setHours(0,0,0,0); maxD.setHours(23,59,59,999);
    const tDays = Math.ceil((maxD - minD) / (1000 * 60 * 60 * 24)); let tWeeks = Math.ceil(tDays / 7); if (tWeeks < 1) tWeeks = 1;
    wsSched.getCell('B3').value = `PEKERJAAN: ${project.work_name || project.name} (DURASI: ${tWeeks} MINGGU / ${tDays} HARI)`;
    const startCol = 7; const endCol = startCol + tWeeks - 1;
    wsSched.mergeCells(5, startCol, 5, endCol); wsSched.getCell(5, startCol).value = "WAKTU PELAKSANAAN"; wsSched.getCell(5, startCol).font = { bold: true }; wsSched.getCell(5, startCol).alignment = { horizontal: 'center', vertical: 'middle' };
    let cM = -1; let mSC = startCol; let mC = 1; let iD = new Date(minD);
    for (let w = 0; w < tWeeks; w++) {
      const col = startCol + w; wsSched.getCell(7, col).value = `M${mC}`; wsSched.getCell(7, col).alignment = { horizontal: 'center' };
      mC++; if (mC > 4) mC = 1; const tM = iD.getMonth(); if (cM === -1) cM = tM;
      if (cM !== tM || w === tWeeks - 1) { const eM = (cM !== tM) ? col - 1 : col; if (mSC <= eM) { wsSched.mergeCells(6, mSC, 6, eM); const mNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]; wsSched.getCell(6, mSC).value = mNames[cM]; wsSched.getCell(6, mSC).alignment = { horizontal: 'center', vertical: 'middle' }; } cM = tM; mSC = col; }
      iD.setDate(iD.getDate() + 7);
    }
    const kC = endCol + 1; wsSched.getCell(5, kC).value = "KET"; wsSched.mergeCells(5, kC, 7, kC); wsSched.getCell(5, kC).alignment = { horizontal: 'center', vertical: 'middle' };
    const gS = {}; scheduleData.forEach(it => { const bab = it.bab || 'I. PEKERJAAN PERSIAPAN'; if (!gS[bab]) gS[bab] = []; gS[bab].push(it); });
    let cR = 8; let gI = 0; const tB = Object.keys(gS).length; const tI = scheduleData.length; const tR = 8 + tB + tI + 1;
    const pS = enrichedLines.reduce((acc, l) => acc + (Number(l.volume || 0) * Number(l.harga_satuan || 0)), 0) || 1;
    Object.entries(gS).forEach(([bT, its], bIx) => {
      wsSched.getCell(`B${cR}`).value = romanize(bIx + 1); wsSched.getCell(`C${cR}`).value = bT.toUpperCase(); wsSched.getRow(cR).font = { bold: true }; for (let i = 2; i <= kC; i++) wsSched.getCell(cR, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
      cR++; its.forEach((it) => {
        gI++; wsSched.getCell(`B${cR}`).value = gI; wsSched.getCell(`C${cR}`).value = it.uraian; const iTV = Number(it.volume || 0) * Number(it.harga_satuan || it.total_subtotal || 0); const iBV = iTV / pS;
        if (isStandalone) { wsSched.getCell(`D${cR}`).value = iTV; wsSched.getCell(`E${cR}`).value = iBV; }
        else { wsSched.getCell(`D${cR}`).value = { formula: `IFERROR(VLOOKUP(C${cR}, 'rab'!C:K, 7, FALSE), 0)`, result: iTV }; wsSched.getCell(`E${cR}`).value = { formula: `IFERROR(D${cR}/D${tR}, 0)`, result: iBV }; }
        wsSched.getCell(`D${cR}`).numFmt = '#,##0.00'; wsSched.getCell(`E${cR}`).numFmt = '0.00%';
        let iS = new Date(it.seq_start || minD); let iE = new Date(it.seq_end || iS); iS.setHours(0,0,0,0); iE.setHours(23,59,59,999);
        const dSD = Math.floor((iS - minD) / (1000 * 60 * 60 * 24)); const sW = Math.max(0, Math.floor(dSD / 7)); const dED = Math.floor((iE - minD) / (1000 * 60 * 60 * 24)); const eW = Math.max(sW, Math.floor(dED / 7)); const iWS = eW - sW + 1;
        for(let w = 0; w < iWS; w++) { const tC = startCol + sW + w; if (tC <= endCol) { wsSched.getCell(cR, tC).value = { formula: `IFERROR($E$${cR}/${iWS}, 0)` }; wsSched.getCell(cR, tC).numFmt = '0.00%'; } }
        cR++;
      });
    });
    wsSched.getRow(cR).height = 5; wsSched.getCell(cR, 2).border = { left: { style: 'thin' } }; wsSched.getCell(cR, kC).border = { right: { style: 'thin' } }; cR++;
    wsSched.mergeCells(`B${tR}:C${tR}`); wsSched.getCell(`B${tR}`).value = "JUMLAH"; wsSched.getCell(`B${tR}`).alignment = { horizontal: 'right' }; wsSched.getRow(tR).font = { bold: true };
    if (isStandalone) { wsSched.getCell(`D${tR}`).value = pS; wsSched.getCell(`E${tR}`).value = 1; }
    else { wsSched.getCell(`D${tR}`).value = { formula: `SUM(D8:D${tR-1})`, result: pS }; wsSched.getCell(`E${tR}`).value = { formula: `SUM(E8:E${tR-1})`, result: 1 }; }
    wsSched.getCell(`D${tR}`).numFmt = '#,##0.00'; wsSched.getCell(`E${tR}`).numFmt = '0.00%';
    const rPM = tR + 2; const kPM = tR + 3; const aPM = tR + 4; const kA  = tR + 5; const dev = tR + 6;
    [rPM, kPM, aPM, kA, dev].forEach(r => { wsSched.mergeCells(`B${r}:E${r}`); wsSched.getCell(`B${r}`).alignment = { horizontal: 'right' }; wsSched.getRow(r).font = { bold: true }; });
    wsSched.getCell(`B${rPM}`).value = "RENCANA PROGRESS MINGGUAN"; wsSched.getCell(`B${kPM}`).value = "KUMULATIF PROGRESS MINGGUAN"; wsSched.getCell(`B${aPM}`).value = "AKTUAL PROGRESS MINGGUAN"; wsSched.getCell(`B${kA}`).value = "KUMULATIF PROGRESS AKTUAL"; wsSched.getCell(`B${dev}`).value = "DEVIASI";
    const wAM = {}; if (Array.isArray(progressData) && progressData.length > 0) { const tPP = scheduleData.reduce((sum, it) => sum + (Number(it.volume || 0) * Number(it.harga_satuan || 0)), 0); progressData.forEach(p => { const wIx = Math.floor(Number(p.day_number) / 7); const it = scheduleData.find(it => it.id === p.entity_id); if (it && tPP > 0) { wAM[wIx] = (wAM[wIx] || 0) + ((Number(p.val || 0) * Number(it.harga_satuan || 0)) / tPP); } }); }
    for (let c = startCol; c <= endCol; c++) { const cIx = c - startCol; const cL = wsSched.getColumn(c).letter; const pCL = wsSched.getColumn(c-1).letter; wsSched.getCell(`${cL}${rPM}`).value = { formula: `SUM(${cL}8:${cL}${tR-1})` }; wsSched.getCell(`${cL}${rPM}`).numFmt = '0.00%'; if (c === startCol) wsSched.getCell(`${cL}${kPM}`).value = { formula: `${cL}${rPM}` }; else wsSched.getCell(`${cL}${kPM}`).value = { formula: `${pCL}${kPM}+${cL}${rPM}` }; wsSched.getCell(`${cL}${kPM}`).numFmt = '0.00%'; const aV = wAM[cIx] || 0; wsSched.getCell(`${cL}${aPM}`).value = aV > 0 ? aV : ""; wsSched.getCell(`${cL}${aPM}`).numFmt = '0.00%'; if (c === startCol) wsSched.getCell(`${cL}${kA}`).value = { formula: `IF(${cL}${aPM}="","",${cL}${aPM})` }; else wsSched.getCell(`${cL}${kA}`).value = { formula: `IF(${cL}${aPM}="","",${pCL}${kA}+${cL}${aV})` }; wsSched.getCell(`${cL}${kA}`).numFmt = '0.00%'; wsSched.getCell(`${cL}${dev}`).value = { formula: `IF(${cL}${kA}="","",${cL}${kA}-${cL}${kPM})` }; wsSched.getCell(`${cL}${dev}`).numFmt = '0.00%'; }
    for (let r = 5; r <= dev; r++) { if (r === tR - 1 || r === tR + 1) { wsSched.getRow(r).height = 5; wsSched.getCell(r, 2).border = { left: { style: 'thin' } }; wsSched.getCell(r, kC).border = { right: { style: 'thin' } }; continue; } for (let c = 2; c <= kC; c++) { const cell = wsSched.getRow(r).getCell(c); cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; } }
    if (headerImageId !== null) wsSched.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
    setupPrinter(wsSched, companyName, `A1:${wsSched.getColumn(endCol+1).letter}${dev+2}`, paperSize, 'landscape');
  }

  // FINAL CLEANUP
  const sheetMap = { 
    'COVER': ['Cover', 'COVER'], 
    'RAB': ['RAB', 'rab'], 
    'HSP': ['HSP', 'hsp'], 
    'AHSP': ['AHSP', 'ahsp'], 
    'HARGA SATUAN': ['Harga Satuan', 'HARGA SATUAN', 'harga satuan', 'Harga Satuan Master', 'HARGA_SATUAN'], 
    'REKAP': ['REKAP', 'rekap', 'rekap rab'], 
    'schedule': ['schedule', 'SCHEDULE', 'Kurva-S'] 
  };
  const selectedSheetNames = selectedSheets.flatMap(s => sheetMap[s.toUpperCase()] || [s]);
  const worksheets = [...workbook.worksheets];
  worksheets.forEach(ws => {
    const wsNameLower = ws.name.toLowerCase();
    const isSelected = selectedSheetNames.some(name => wsNameLower === name.toLowerCase());
    
    if (!isSelected) { 
      workbook.removeWorksheet(ws.id); 
      return; 
    }
    
    let hasData = false; 
    const sR = wsNameLower.includes('rab') ? 12 : 6; 
    let hRWD = sR;
    
    ws.eachRow({ includeEmpty: true }, (row, rN) => { 
      if (rN >= sR) { 
        let rHC = false; 
        for (let i = 2; i <= 14; i++) { 
          const val = row.getCell(i).value;
          if (val !== null && val !== "") { rHC = true; break; } 
        } 
        if (rHC) { hasData = true; hRWD = Math.max(hRWD, rN); } 
      } 
    });
    
    // Jangan hapus jika itu sheet utama yang dipilih, walaupun kosong (opsional tapi aman)
    const isMainSheet = wsNameLower.includes('cover') || wsNameLower.includes('harga satuan') || wsNameLower.includes('rab') || wsNameLower.includes('ahsp') || wsNameLower.includes('hsp');

    if (!hasData && !isMainSheet) { 
      workbook.removeWorksheet(ws.id); 
    } else {
      const lR = hRWD + 2; 
      let lC = 'K'; 
      if (wsNameLower.includes('ahsp')) lC = 'O'; 
      else if (wsNameLower.includes('hsp')) lC = 'I'; 
      else if (wsNameLower.includes('harga satuan')) lC = 'J'; 
      else if (wsNameLower.includes('rekap')) lC = 'J';
      else if (wsNameLower.includes('rab')) lC = 'L';
      
      setupPrinter(ws, companyName, `A1:${lC}${lR}`, paperSize, (wsNameLower.includes('schedule') || wsNameLower.includes('kurva-s')) ? 'landscape' : 'portrait');
    }
  });

  const outB = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outB], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `Laporan_Proyek_${project.work_name || project.name || 'Export'}.xlsx`;
  a.click(); window.URL.revokeObjectURL(url);
};

export { generateProjectReport };
