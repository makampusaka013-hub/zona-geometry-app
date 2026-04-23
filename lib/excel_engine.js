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
        row.eachCell(cell => {
            cell.value = null;
            cell.style = {};
        });
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

const setupPrinter = (ws, companyName) => {
    if (!ws) return;
    ws.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
    };
    
    // Ensure headerFooter object exists
    if (!ws.headerFooter) {
        ws.headerFooter = { oddHeader: '', oddFooter: '' };
    }
    
    ws.headerFooter.oddHeader = `&C&"Arial,Bold"&12${companyName}\n&"Arial,Regular"&10Laporan Proyek Konstruksi`;
    ws.headerFooter.oddFooter = `&L&8Dicetak pada: &D &T&R&8Halaman &P dari &N`;
};

const generateProjectReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const { isCatalog = false, projectPrices = [], catAhsp = [], catPrice = [] } = options;
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const projectLocation = project.location || project.address || '-';
  const ppnPercent = project.ppn || 11;

  // Build price map from project specific prices (Komponen Harga)
  // Safety check for null projectPrices
  const safeProjectPrices = Array.isArray(projectPrices) ? projectPrices : [];
  const priceMap = Object.fromEntries(safeProjectPrices.map(p => [p.kode_item, p.harga_satuan]));
  
  // If in catalog mode, use catPrice
  if (isCatalog && Array.isArray(catPrice)) {
    catPrice.forEach(p => { priceMap[p.kode_item] = p.harga_satuan; });
  }

  const response = await fetch(`/templates/master_template_rab.xlsx?v=${Date.now()}`);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const enrichedLines = ahspLines;

  // 1. Process Resources
  if (selectedSheets.includes('HARGA SATUAN')) {
    const resources = {};
    enrichedLines.forEach(line => {
      const details = line.master_ahsp?.details || line.analisa_custom || [];
      details.forEach(d => {
        const itemCode = d.kode_item || d.kode || d.id;
        if (!itemCode) return;
        if (!resources[itemCode]) {
          // Robust price lookup: snapshot -> priceMap (from components) -> default
          let itemPrice = Number(d.harga_satuan_snapshot || 0);
          if (itemPrice === 0) {
            itemPrice = Number(priceMap[itemCode] || d.harga_satuan || d.harga || 0);
          }
          
          resources[itemCode] = {
            kode: itemCode,
            uraian: d.uraian || d.nama_item || d.uraian_custom || '-',
            satuan: d.satuan || '-',
            harga: itemPrice,
            jenis: (d.jenis_komponen || d.jenis || d.jenis_uraian || d.kategori || 'Lainnya').toLowerCase(),
            tkdn: Number(d.tkdn || d.tkdn_percent || 0)
          };
        }
      });
    });

    const ws = workbook.getWorksheet('harga satuan terpakai') || workbook.getWorksheet('harga_satuan_terpakai');
    if (ws) {
      clearDataRows(ws, 7, 1000);
      ws.getCell('B2').value = `TAHUN ANGGARAN ${project.fiscal_year || '2026'} ${(projectLocation || '-').toUpperCase()}`;
      
      let currentRow = 6;
      const groups = [
        { label: 'TENAGA KERJA', types: ['upah', 'tenaga'] },
        { label: 'BAHAN', types: ['bahan'] },
        { label: 'PERALATAN', types: ['alat', 'peralatan', 'mesin'] }
      ];

      groups.forEach(group => {
        const items = Object.values(resources).filter(r => 
          group.types.some(t => r.jenis.includes(t))
        );
        if (items.length > 0) {
          currentRow++;
          ws.getCell(`B${currentRow}`).value = group.label.charAt(0);
          ws.getCell(`D${currentRow}`).value = group.label;
          ws.getRow(currentRow).fill = { type: 'pattern', pattern:'solid', fgColor: { argb: 'F1F5F9' } };
          applyBorder(ws, currentRow, 'B', 'I');
          currentRow++;
          items.forEach((r, idx) => {
            ws.getCell(`B${currentRow}`).value = idx + 1;
            ws.getCell(`D${currentRow}`).value = r.uraian;
            ws.getCell(`E${currentRow}`).value = r.kode;
            ws.getCell(`F${currentRow}`).value = r.satuan;
            ws.getCell(`G${currentRow}`).value = Number(r.harga);
            ws.getCell(`G${currentRow}`).numFmt = '#,##0.00';
            ws.getCell(`I${currentRow}`).value = Number(r.tkdn) / 100;
            ws.getCell(`I${currentRow}`).numFmt = '0.00%';
            ws.getRow(currentRow).font = { bold: false };
            applyBorder(ws, currentRow, 'B', 'I');
            currentRow++;
          });
        }
      });
      // Ensure all rows from 6 up to the last data row have borders
      for (let r = 6; r <= currentRow; r++) applyBorder(ws, r, 'B', 'I');
      setupPrinter(ws, companyName);
    }
  }

// 2. Process HSP & AHSP
if (selectedSheets.includes('HSP') || selectedSheets.includes('AHSP')) {
  let hspRow = 7;
  let ahspRow = 9; // User wants B9 for AHSP
  const wsHSP = workbook.getWorksheet('hsp') || workbook.getWorksheet('HSP');
  const wsAHSP = workbook.getWorksheet('ahsp') || workbook.getWorksheet('AHSP');

  if (wsHSP) clearDataRows(wsHSP, 7, 1000);
  if (wsAHSP) clearDataRows(wsAHSP, 9, 5000);
  if (wsAHSP) wsAHSP.getCell('B2').value = `TAHUN ANGGARAN ${project.fiscal_year || '2026'} ${(projectLocation || '-').toUpperCase()}`;

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
        wsHSP.getCell(`D${hspRow}`).value = (babTitle || '-').toUpperCase();
        wsHSP.getRow(hspRow).fill = { type: 'pattern', pattern:'solid', fgColor: { argb: 'E2E8F0' } };
        applyBorder(wsHSP, hspRow, 'B', 'H'); // B:H for HSP
        hspRow++;
      }
      if (wsAHSP) {
        wsAHSP.getCell(`B${ahspRow}`).value = bIdx + 1;
        wsAHSP.getCell(`C${ahspRow}`).value = (babTitle || '-').toUpperCase();
        wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: 'FACC15' } };
        applyBorder(wsAHSP, ahspRow, 'B', 'N'); // B:N for AHSP
        ahspRow++;
      }
      Object.entries(subBabs).forEach(([subTitle, categories], sIdx) => {
        if (subTitle) {
          if (wsHSP) {
            wsHSP.getCell(`D${hspRow}`).value = (subTitle || '-').toUpperCase();
            applyBorder(wsHSP, hspRow, 'B', 'H');
            hspRow++;
          }
          if (wsAHSP) {
            ahspRow++;
            wsAHSP.getCell(`B${ahspRow}`).value = `${bIdx + 1}.${sIdx + 1}`;
            wsAHSP.getCell(`C${ahspRow}`).value = (subTitle || '-').toUpperCase();
            wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: 'FACC15' } };
            applyBorder(wsAHSP, ahspRow, 'B', 'N');
            ahspRow++;
          }
        }
        Object.entries(categories).forEach(([catTitle, items], cIdx) => {
          if (catTitle) {
            if (wsHSP) {
              wsHSP.getCell(`D${hspRow}`).value = (catTitle || '-').toUpperCase();
              applyBorder(wsHSP, hspRow, 'B', 'H');
              hspRow++;
            }
            if (wsAHSP) {
              ahspRow++;
              wsAHSP.getCell(`B${ahspRow}`).value = `${bIdx + 1}.${cIdx + 1}`;
              wsAHSP.getCell(`C${ahspRow}`).value = (catTitle || '-').toUpperCase();
              wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: 'FACC15' } };
              applyBorder(wsAHSP, ahspRow, 'B', 'N');
              ahspRow++;
            }
          }
          items.forEach((line) => {
            const itemCode = isCatalog ? line.kode_ahsp : (line.master_ahsp?.kode_ahsp || '-');
            if (wsHSP) {
              wsHSP.getCell(`B${hspRow}`).value = itemCode; 
              wsHSP.getCell(`C${hspRow}`).value = itemCode; 
              wsHSP.getCell(`D${hspRow}`).value = line.uraian || line.nama_pekerjaan;
              wsHSP.getCell(`E${hspRow}`).value = line.satuan || line.satuan_pekerjaan;
              wsHSP.getCell(`F${hspRow}`).value = Number(line.harga_satuan || line.total_subtotal || 0);
              wsHSP.getCell(`F${hspRow}`).numFmt = '#,##0.00';
              wsHSP.getCell(`G${hspRow}`).value = Number(line.tkdn || line.total_tkdn_percent || 100) / 100;
              wsHSP.getCell(`G${hspRow}`).numFmt = '0.00%';
              wsHSP.getCell(`H${hspRow}`).value = "" ; 
              applyBorder(wsHSP, hspRow, 'B', 'H'); // B:H for HSP
              hspRow++;
            }
            if (wsAHSP) {
              const mainHeaderRow = ahspRow;
              wsAHSP.getCell(`B${mainHeaderRow}`).value = itemCode;
              wsAHSP.getCell(`D${mainHeaderRow}`).value = ((line.uraian || line.nama_pekerjaan || '-') + "").toUpperCase();
              wsAHSP.getCell(`F${mainHeaderRow}`).value = line.satuan || line.satuan_pekerjaan;
              wsAHSP.getCell(`L${mainHeaderRow}`).value = (line.overhead_profit || 15) / 100;
              wsAHSP.getCell(`L${mainHeaderRow}`).numFmt = '0.00%';
              applyBorder(wsAHSP, mainHeaderRow, 'B', 'N');
              ahspRow++;
              const startDetailRow = ahspRow;
              const details = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || []);
              const ahspCats = [
                { label: 'TENAGA KERJA', types: ['upah', 'tenaga'] },
                { label: 'BAHAN', types: ['bahan'] },
                { label: 'PERALATAN', types: ['alat', 'peralatan', 'mesin'] }
              ];
              ahspCats.forEach(cat => {
                const filtered = details.filter(d => {
                  const lowJenis = (d.jenis_komponen || d.jenis || d.jenis_uraian || '').toLowerCase();
                  return cat.types.some(t => lowJenis.includes(t));
                });
                if (filtered.length > 0) {
                  wsAHSP.getCell(`B${ahspRow}`).value = cat.label.charAt(0);
                  wsAHSP.getCell(`D${ahspRow}`).value = cat.label;
                  applyBorder(wsAHSP, ahspRow, 'B', 'N');
                  ahspRow++;
                  filtered.forEach((d) => {
                    const koef = Number(d.koefisien || 0);
                    const itemPrice = Number(d.harga_satuan_snapshot || d.harga_satuan || d.harga || priceMap[d.kode_item] || 0);
                    const subtotal = koef * itemPrice;
                    
                    wsAHSP.getCell(`D${ahspRow}`).value = d.uraian;
                    wsAHSP.getCell(`E${ahspRow}`).value = d.kode_item || d.kode;
                    wsAHSP.getCell(`F${ahspRow}`).value = d.satuan;
                    wsAHSP.getCell(`G${ahspRow}`).value = koef;
                    wsAHSP.getCell(`H${ahspRow}`).value = { 
                      formula: `IFERROR(VLOOKUP(E${ahspRow}, 'harga satuan terpakai'!E:G, 3, FALSE), ${itemPrice})`, 
                      result: itemPrice
                    };
                    wsAHSP.getCell(`H${ahspRow}`).numFmt = '#,##0.00';
                    
                    const subtotalFormula = { formula: `G${ahspRow}*H${ahspRow}`, result: subtotal };
                    if (cat.label === 'TENAGA KERJA') {
                      wsAHSP.getCell(`I${ahspRow}`).value = subtotalFormula;
                      wsAHSP.getCell(`I${ahspRow}`).numFmt = '#,##0.00';
                    } else if (cat.label === 'BAHAN') {
                      wsAHSP.getCell(`J${ahspRow}`).value = subtotalFormula;
                      wsAHSP.getCell(`J${ahspRow}`).numFmt = '#,##0.00';
                    } else {
                      wsAHSP.getCell(`K${ahspRow}`).value = subtotalFormula;
                      wsAHSP.getCell(`K${ahspRow}`).numFmt = '#,##0.00';
                    }
                    wsAHSP.getCell(`N${ahspRow}`).value = Number(d.tkdn || d.tkdn_percent || 0) / 100;
                    wsAHSP.getCell(`N${ahspRow}`).numFmt = '0.00%';
                    wsAHSP.getRow(ahspRow).font = { bold: false };
                    applyBorder(wsAHSP, ahspRow, 'B', 'N');
                    ahspRow++;
                  });
                }
              });
              const endDetailRow = ahspRow - 1;
              if (startDetailRow <= endDetailRow) {
                wsAHSP.getCell(`I${mainHeaderRow}`).value = { formula: `SUM(I${startDetailRow}:I${endDetailRow})`, result: 0 };
                wsAHSP.getCell(`J${mainHeaderRow}`).value = { formula: `SUM(J${startDetailRow}:J${endDetailRow})`, result: 0 };
                wsAHSP.getCell(`K${mainHeaderRow}`).value = { formula: `SUM(K${startDetailRow}:K${endDetailRow})`, result: 0 };
              }
              wsAHSP.getCell(`I${mainHeaderRow}`).numFmt = '#,##0.00';
              wsAHSP.getCell(`J${mainHeaderRow}`).numFmt = '#,##0.00';
              wsAHSP.getCell(`K${mainHeaderRow}`).numFmt = '#,##0.00';
              wsAHSP.getCell(`M${mainHeaderRow}`).value = { formula: `(I${mainHeaderRow}+J${mainHeaderRow}+K${mainHeaderRow})*(1+L${mainHeaderRow})`, result: 0 };
              wsAHSP.getCell(`M${mainHeaderRow}`).numFmt = '#,##0.00';
              wsAHSP.getCell(`M${mainHeaderRow}`).font = { bold: false };
              wsAHSP.getCell(`N${mainHeaderRow}`).value = Number(line.tkdn || line.total_tkdn_percent || 0) / 100;
              wsAHSP.getCell(`N${mainHeaderRow}`).numFmt = '0.00%';
              wsAHSP.getCell(`N${mainHeaderRow}`).font = { bold: false };
              wsAHSP.getCell(`P${mainHeaderRow}`).value = ",..," ; 
              ahspRow++; // Only 1 row gap instead of 2
            }
          });
        });
      });
    });
  }

  // 3. Process RAB
  if (selectedSheets.includes('RAB')) {
    const wsRAB = workbook.worksheets.find(s => s.name.startsWith('RAB')) || workbook.getWorksheet('RAB_');
    if (wsRAB) {
      clearDataRows(wsRAB, 14, 1000);
      wsRAB.getCell('B2').value = `TAHUN ANGGARAN ${project.fiscal_year || '2026'} ${(projectLocation || '-').toUpperCase()}`;
      wsRAB.getCell('D7').value = project.work_name || project.name;
      wsRAB.getCell('D8').value = projectLocation;
      wsRAB.getCell('D9').value = project.fiscal_year || '2026';
      let rabRow = 14;
      let totalBiayaPekerjaan = 0;
      const groupedRAB = {};
      enrichedLines.forEach(line => {
        const bab = line.bab_pekerjaan || 'I. UMUM';
        const subBab = line.sub_bab || '';
        const category = line.kategori || '';
        if (!groupedRAB[bab]) groupedRAB[bab] = {};
        if (!groupedRAB[bab][subBab]) groupedRAB[bab][subBab] = {};
        if (!groupedRAB[bab][subBab][category]) groupedRAB[bab][subBab][category] = [];
        groupedRAB[bab][subBab][category].push(line);
      });
      Object.entries(groupedRAB).forEach(([babTitle, subBabs], bIdx) => {
        rabRow++;
        wsRAB.getCell('A' + rabRow).value = romanize(bIdx + 1);
        wsRAB.getCell('B' + rabRow).value = (babTitle || '-').toUpperCase();
        wsRAB.getCell('B' + rabRow).font = { bold: true };
        applyBorder(wsRAB, rabRow, 'A', 'G');
        Object.entries(subBabs).forEach(([subTitle, categories], sIdx) => {
          if (subTitle) {
            rabRow++;
            wsRAB.getCell('A' + rabRow).value = `${bIdx + 1}.${sIdx + 1}`;
            wsRAB.getCell('B' + rabRow).value = (subTitle || '-').toUpperCase();
            wsRAB.getCell('B' + rabRow).font = { bold: true };
            applyBorder(wsRAB, rabRow, 'A', 'G');
          }
          Object.entries(categories).forEach(([catTitle, items], cIdx) => {
            if (catTitle) {
              rabRow++;
              wsRAB.getCell('B' + rabRow).value = (catTitle || '-').toUpperCase();
              applyBorder(wsRAB, rabRow, 'A', 'G');
            }
            items.forEach((l, lIdx) => {
              rabRow++;
              wsRAB.getCell('A' + rabRow).value = lIdx + 1;
              wsRAB.getCell('B' + rabRow).value = l.uraian;
              wsRAB.getCell('C' + rabRow).value = l.master_ahsp?.kode_ahsp || '-';
              wsRAB.getCell('D' + rabRow).value = l.satuan;
              wsRAB.getCell('E' + rabRow).value = Number(l.volume || 0);
              wsRAB.getCell('F' + rabRow).value = Number(l.harga_satuan || 0);
              wsRAB.getCell('F' + rabRow).numFmt = '#,##0.00';
              const itemJumlah = Number(l.volume || 0) * Number(l.harga_satuan || 0);
              totalBiayaPekerjaan += itemJumlah;
              wsRAB.getCell('G' + rabRow).value = { formula: `E${rabRow}*F${rabRow}`, result: itemJumlah };
              wsRAB.getCell('G' + rabRow).numFmt = '#,##0.00';
              applyBorder(wsRAB, rabRow, 'A', 'G');
            });
          });
        });
        rabRow++; 
      });
      const summaryStartRow = 15;
      const summaryEndRow = rabRow - 1;
      const ppnAmount = Math.round(totalBiayaPekerjaan * (ppnPercent / 100));
      const grandTotal = totalBiayaPekerjaan + ppnAmount;
      const rounded = Math.round(grandTotal / 1000) * 1000;
      rabRow += 1;
      const tRow = rabRow;
      wsRAB.getCell('B' + tRow).value = 'TOTAL HARGA PEKERJAAN';
      wsRAB.getCell('G' + tRow).value = { formula: `SUM(G${summaryStartRow}:G${summaryEndRow})`, result: totalBiayaPekerjaan };
      wsRAB.getCell('G' + tRow).numFmt = '#,##0.00';
      applyBorder(wsRAB, tRow, 'B', 'G');
      rabRow++;
      const pRow = rabRow;
      wsRAB.getCell('B' + pRow).value = `PPN ${ppnPercent}%`;
      wsRAB.getCell('G' + pRow).value = { formula: `G${tRow}*${ppnPercent/100}`, result: ppnAmount };
      wsRAB.getCell('G' + pRow).numFmt = '#,##0.00';
      applyBorder(wsRAB, pRow, 'B', 'G');
      rabRow++;
      const gRow = rabRow;
      wsRAB.getCell('B' + gRow).value = 'TOTAL KESELURUHAN';
      wsRAB.getCell('G' + gRow).value = { formula: `G${tRow}+G${pRow}`, result: grandTotal };
      wsRAB.getCell('G' + gRow).numFmt = '#,##0.00';
      applyBorder(wsRAB, gRow, 'B', 'G');
      rabRow++;
      const rRow = rabRow;
      wsRAB.getCell('B' + rRow).value = 'DIBULATKAN';
      wsRAB.getCell('G' + rRow).value = { formula: `ROUND(G${gRow}/1000,0)*1000`, result: rounded };
      wsRAB.getCell('G' + rRow).numFmt = '#,##0.00';
      applyBorder(wsRAB, rRow, 'B', 'G');
      rabRow += 2;
      wsRAB.getCell('B' + rabRow).value = 'Terbilang:';
      wsRAB.getCell('C' + rabRow).value = formatTerbilang(rounded);
      wsRAB.getCell('C' + rabRow).font = { italic: true, bold: true };
      setupPrinter(wsRAB, companyName);
    }
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laporan_Proyek_${project.name || 'Export'}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

export { generateProjectReport };
