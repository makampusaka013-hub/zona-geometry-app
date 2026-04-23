import ExcelJS from 'exceljs';
import { formatTerbilang, romanize } from './indonesia_helper';

/**
 * Advanced Excel Template Engine using ExcelJS
 * Supports style preservation, visual Gantt bars, and precision print layout.
 */
export async function generateProjectReport(project, member, ahspLines, selectedSheets, extra = {}) {
  const isCatalog = extra.isCatalog || false;
  // Always use the professional 'rab' template as it contains the base layouts
  const templateType = 'rab';
  
  const response = await fetch(`/templates/master_template_${templateType}.xlsx`);
  const buffer = await response.arrayBuffer();
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Helper to clear existing template data rows
  const clearDataRows = (ws, startRow, endRow = 1000) => {
    if (!ws) return;
    for (let r = startRow; r <= endRow; r++) {
      const row = ws.getRow(r);
      row.eachCell((cell) => {
        cell.value = null;
      });
    }
  };
  
  const currentLines = isCatalog ? (extra.catAhsp || []) : ahspLines;
  const currentPrices = isCatalog ? (extra.catPrice || []) : null;

  const ppnPercent = project.ppn_percent ?? 12;
  const companyName = member?.company || 'Pribadi';
  const projectLocation = project.location || '-';

  // 1. Process Harga Satuan (Used Resources)
  if (selectedSheets.includes('HARGA SATUAN')) {
    const ws = workbook.getWorksheet('harga_satuan_terpakai') || workbook.getWorksheet('HARGA SATUAN');
    if (ws) {
      clearDataRows(ws, 6, 1000); // Clear template data
      // Set Title with Location and Year
      ws.getCell('B2').value = `TAHUN ANGGARAN ${project.fiscal_year || '2026'} ${(projectLocation || '-').toUpperCase()}`;

      const resources = new Map();
      
      if (isCatalog && currentPrices) {
        currentPrices.forEach(p => {
            const item = p.master_items || {};
            const key = item.kode || item.kode_item || item.uraian || p.uraian;
            if (key) {
                resources.set(key, {
                    kode: item.kode || item.kode_item || '-',
                    uraian: item.uraian || p.uraian || '-',
                    satuan: item.satuan || p.satuan || '-',
                    jenis: item.jenis_komponen || p.jenis || '-',
                    harga: p.harga_satuan || p.harga_dasar || 0,
                    tkdn: item.tkdn || p.tkdn_percent || 100
                });
            }
        });
      } else {
        ahspLines.forEach(item => {
            (item.master_ahsp?.details || item.analisa_custom || []).forEach(d => {
            const key = d.kode_item || d.uraian;
            if (!resources.has(key)) {
                resources.set(key, {
                kode: d.kode_item || '-',
                uraian: d.uraian,
                satuan: d.satuan,
                jenis: d.jenis_komponen || d.jenis || '-',
                harga: d.harga_satuan_snapshot || d.harga_satuan || 0,
                tkdn: d.tkdn || 0
                });
            }
            });
        });
      }

      const sorted = Array.from(resources.values()).sort((a, b) => {
        if (a.jenis !== b.jenis) return a.jenis.localeCompare(b.jenis);
        return a.uraian.localeCompare(b.uraian);
      });

      const types = [
        { key: 'upah', label: 'UPAH PEKERJA', code: 'A' },
        { key: 'bahan lokal', label: 'BAHAN LOKAL', code: 'B' },
        { key: 'bahan', label: 'BAHAN LOKAL', code: 'B' }, // Default for just "bahan"
        { key: 'non lokal', label: 'BAHAN NON LOKAL', code: 'C' },
        { key: 'alat', label: 'ALAT/SEWA ALAT', code: 'D' }
      ];

      let currentRow = 6;
      const handledKeys = new Set();

      types.forEach((type) => {
        if (handledKeys.has(type.code)) return; // Prevent duplicate for 'bahan' and 'bahan lokal'
        
        const filtered = sorted.filter(r => {
            const lowJenis = (r.jenis || '').toLowerCase();
            if (type.key === 'bahan') {
                return lowJenis === 'bahan'; // Exact match for generic bahan
            }
            return lowJenis.includes(type.key);
        });

        if (filtered.length > 0) {
          handledKeys.add(type.code);
          // Section Header Row (e.g., "A", "UPAH PEKERJA")
          ws.getCell(`B${currentRow}`).value = type.code;
          ws.getCell(`C${currentRow}`).value = type.label;
          ws.getCell(`K${currentRow}`).value = ",..," ; // Hidden control for formatting
          currentRow++;

          filtered.forEach((r, i) => {
            ws.getCell(`B${currentRow}`).value = i + 1;
            ws.getCell(`D${currentRow}`).value = r.uraian;
            ws.getCell(`E${currentRow}`).value = r.kode;
            ws.getCell(`F${currentRow}`).value = r.satuan;
            ws.getCell(`G${currentRow}`).value = Number(r.harga);
            ws.getCell(`H${currentRow}`).value = ''; // Keterangan
            ws.getCell(`I${currentRow}`).value = Number(r.tkdn) / 100;
            ws.getCell(`K${currentRow}`).value = ",..," ; // Hidden control
            currentRow++;
          });
          currentRow++; // 1 empty row between sections
        }
      });
      setupPrinter(ws, companyName);
    }
  }

  // 2. Process HSP & AHSP
  if (selectedSheets.includes('HSP') || selectedSheets.includes('AHSP')) {
    const wsHSP = workbook.getWorksheet('hsp') || workbook.getWorksheet('HSP');
    const wsAHSP = workbook.getWorksheet('ahsp') || workbook.getWorksheet('AHSP');
    
    if (wsHSP) clearDataRows(wsHSP, 7, 2000); // Clear template data
    if (wsAHSP) clearDataRows(wsAHSP, 7, 15000); // Clear template data (large for AHSP)

    // Official reference header for AHSP
    if (wsAHSP) {
        wsAHSP.getCell('B4').value = 'Surat Edaran Direktur Jenderal Bina Konstruksi Nomor 182/SE/Dk/2025';
    }

    let hspRow = 7;
    let ahspRow = 7;

    // Helper to group by hierarchy: Bab -> SubBab -> Category
    const groupedItems = {};
    currentLines.forEach(line => {
        // Fallback for catalog mode naming (divisi instead of bab_pekerjaan)
        const bab = line.bab_pekerjaan || line.divisi || 'I. PEKERJAAN PERSIAPAN';
        const subBab = line.sub_bab || '';
        const category = line.kategori || line.kategori_pekerjaan || '';

        if (!groupedItems[bab]) groupedItems[bab] = {};
        if (!groupedItems[bab][subBab]) groupedItems[bab][subBab] = {};
        if (!groupedItems[bab][subBab][category]) groupedItems[bab][subBab][category] = [];
        
        groupedItems[bab][subBab][category].push(line);
    });

    Object.entries(groupedItems).forEach(([babTitle, subBabs], bIdx) => {
        // Write Bab Row
        if (wsHSP) {
            wsHSP.getCell(`B${hspRow}`).value = bIdx + 1;
            wsHSP.getCell(`D${hspRow}`).value = (babTitle || '-').toUpperCase();
            wsHSP.getCell(`J${hspRow}`).value = ",.."; // Bab formatting trigger
            hspRow++;
        }
        if (wsAHSP) {
            wsAHSP.getCell(`B${ahspRow}`).value = bIdx + 1;
            wsAHSP.getCell(`C${ahspRow}`).value = (babTitle || '-').toUpperCase();
            wsAHSP.getCell(`P${ahspRow}`).value = ",.."; // Bab formatting trigger
            ahspRow++;
        }

        Object.entries(subBabs).forEach(([subTitle, categories], sIdx) => {
            if (subTitle) {
                if (wsHSP) {
                    wsHSP.getCell(`B${hspRow}`).value = `${bIdx + 1}.${sIdx + 1}`;
                    wsHSP.getCell(`D${hspRow}`).value = (subTitle || '-').toUpperCase();
                    wsHSP.getCell(`J${hspRow}`).value = ",.."; 
                    hspRow++;
                }
                if (wsAHSP) {
                    wsAHSP.getCell(`B${ahspRow}`).value = `${bIdx + 1}.${sIdx + 1}`;
                    wsAHSP.getCell(`C${ahspRow}`).value = (subTitle || '-').toUpperCase();
                    wsAHSP.getCell(`P${ahspRow}`).value = ",.."; 
                    ahspRow++;
                }
            }

            Object.entries(categories).forEach(([catTitle, items], cIdx) => {
                if (catTitle) {
                    const code = subTitle ? `${bIdx + 1}.${sIdx + 1}.${cIdx + 1}` : `${bIdx + 1}.${cIdx + 1}`;
                    if (wsHSP) {
                        wsHSP.getCell(`B${hspRow}`).value = code;
                        wsHSP.getCell(`D${hspRow}`).value = (catTitle || '-').toUpperCase();
                        wsHSP.getCell(`J${hspRow}`).value = ",..";
                        hspRow++;
                    }
                    if (wsAHSP) {
                        wsAHSP.getCell(`B${ahspRow}`).value = code;
                        wsAHSP.getCell(`C${ahspRow}`).value = (catTitle || '-').toUpperCase();
                        wsAHSP.getCell(`P${ahspRow}`).value = ",..";
                        ahspRow++;
                    }
                }

                items.forEach((line) => {
                    const itemCode = isCatalog ? line.kode_ahsp : (line.master_ahsp?.kode_ahsp || '-');
                    
                    if (wsHSP) {
                        wsHSP.getCell(`B${hspRow}`).value = itemCode; 
                        wsHSP.getCell(`C${hspRow}`).value = itemCode; // Kode Umum
                        // Fallback for catalog 'nama_pekerjaan'
                        wsHSP.getCell(`D${hspRow}`).value = line.uraian || line.nama_pekerjaan;
                        wsHSP.getCell(`F${hspRow}`).value = line.satuan || line.satuan_pekerjaan;
                        // Fallback for catalog 'total_subtotal'
                        wsHSP.getCell(`H${hspRow}`).value = Number(line.harga_satuan || line.total_subtotal || 0);
                        wsHSP.getCell(`G${hspRow}`).value = Number(line.tkdn || line.total_tkdn_percent || 100) / 100;
                        wsHSP.getCell(`J${hspRow}`).value = ",..," ; // Item trigger
                        hspRow++;
                    }

                    if (wsAHSP) {
                        const mainHeaderRow = ahspRow;
                        const itemCode = isCatalog ? line.kode_ahsp : (line.master_ahsp?.kode_ahsp || '-');
                        
                        // MAIN HEADER ROW
                        wsAHSP.getCell(`B${mainHeaderRow}`).value = itemCode;
                        wsAHSP.getCell(`D${mainHeaderRow}`).value = ((line.uraian || line.nama_pekerjaan || '-') + "").toUpperCase();
                        wsAHSP.getCell(`F${mainHeaderRow}`).value = line.satuan || line.satuan_pekerjaan;
                        
                        // L - PROFIT (%)
                        const profitPct = (line.overhead_profit || 10) / 100;
                        wsAHSP.getCell(`L${mainHeaderRow}`).value = profitPct;
                        wsAHSP.getCell(`L${mainHeaderRow}`).numFmt = '0.00%';

                        ahspRow++;
                        const startDetailRow = ahspRow;

                        const details = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || []);
                        details.forEach((d, dIdx) => {
                            wsAHSP.getCell(`B${ahspRow}`).value = dIdx + 1;
                            wsAHSP.getCell(`D${ahspRow}`).value = d.uraian;
                            wsAHSP.getCell(`E${ahspRow}`).value = d.kode_item;
                            wsAHSP.getCell(`F${ahspRow}`).value = d.satuan;
                            wsAHSP.getCell(`G${ahspRow}`).value = Number(d.koefisien || 0);
                            wsAHSP.getCell(`H${ahspRow}`).value = Number(d.harga_satuan_snapshot || d.harga_satuan || 0);
                            
                            const lowJenis = (d.jenis_komponen || d.jenis || '').toLowerCase();
                            // Formula: G * H
                            const subtotalFormula = { formula: `G${ahspRow}*H${ahspRow}` };
                            
                            if (lowJenis.includes('upah')) {
                                wsAHSP.getCell(`I${ahspRow}`).value = subtotalFormula;
                                wsAHSP.getCell(`I${ahspRow}`).numFmt = '#,##0.00';
                            } else if (lowJenis.includes('bahan')) {
                                wsAHSP.getCell(`J${ahspRow}`).value = subtotalFormula;
                                wsAHSP.getCell(`J${ahspRow}`).numFmt = '#,##0.00';
                            } else {
                                wsAHSP.getCell(`K${ahspRow}`).value = subtotalFormula;
                                wsAHSP.getCell(`K${ahspRow}`).numFmt = '#,##0.00';
                            }

                            // TKDN detail
                            wsAHSP.getCell(`N${ahspRow}`).value = Number(d.tkdn || 0) / 100;
                            wsAHSP.getCell(`N${ahspRow}`).numFmt = '0.00%';

                            wsAHSP.getCell(`P${ahspRow}`).value = ",..,";
                            ahspRow++;
                        });
                        const endDetailRow = ahspRow - 1;

                        // Fill Header Summary Formulas
                        if (startDetailRow <= endDetailRow) {
                            wsAHSP.getCell(`I${mainHeaderRow}`).value = { formula: `SUM(I${startDetailRow}:I${endDetailRow})` };
                            wsAHSP.getCell(`J${mainHeaderRow}`).value = { formula: `SUM(J${startDetailRow}:J${endDetailRow})` };
                            wsAHSP.getCell(`K${mainHeaderRow}`).value = { formula: `SUM(K${startDetailRow}:K${endDetailRow})` };
                        } else {
                            wsAHSP.getCell(`I${mainHeaderRow}`).value = 0;
                            wsAHSP.getCell(`J${mainHeaderRow}`).value = 0;
                            wsAHSP.getCell(`K${mainHeaderRow}`).value = 0;
                        }

                        // Number formats for totals
                        wsAHSP.getCell(`I${mainHeaderRow}`).numFmt = '#,##0.00';
                        wsAHSP.getCell(`J${mainHeaderRow}`).numFmt = '#,##0.00';
                        wsAHSP.getCell(`K${mainHeaderRow}`).numFmt = '#,##0.00';

                        // TOTAL (M) on header row: (I + J + K) * (1 + L)
                        wsAHSP.getCell(`M${mainHeaderRow}`).value = { formula: `(I${mainHeaderRow}+J${mainHeaderRow}+K${mainHeaderRow})*(1+L${mainHeaderRow})` };
                        wsAHSP.getCell(`M${mainHeaderRow}`).numFmt = '#,##0.00';
                        wsAHSP.getCell(`M${mainHeaderRow}`).font = { bold: true };
                        
                        // TKDN (N) on header row
                        wsAHSP.getCell(`N${mainHeaderRow}`).value = Number(line.tkdn || line.total_tkdn_percent || 0) / 100;
                        wsAHSP.getCell(`N${mainHeaderRow}`).numFmt = '0.00%';
                        wsAHSP.getCell(`N${mainHeaderRow}`).font = { bold: true };

                        wsAHSP.getCell(`P${mainHeaderRow}`).value = ",..," ; // Item trigger
                        ahspRow += 2;
                    }
                });
            });
        });
    });

    // Finalize HSP/AHSP Sheets
    if (wsHSP) setupPrinter(wsHSP, companyName);
    if (wsAHSP) setupPrinter(wsAHSP, companyName);
  }

  // 3. Process RAB & REKAP
  if (selectedSheets.includes('RAB')) {
    const wsRAB = workbook.worksheets.find(s => s.name.startsWith('RAB')) || workbook.getWorksheet('RAB_');
    if (wsRAB) {
        clearDataRows(wsRAB, 14, 500); // Clear template data
        // Headers - Dynamic based on project data
        wsRAB.getCell('B2').value = `TAHUN ANGGARAN ${project.fiscal_year || '2026'} ${(projectLocation || '-').toUpperCase()}`;
        wsRAB.getCell('D7').value = project.work_name || project.name;
        wsRAB.getCell('D8').value = projectLocation;
        wsRAB.getCell('D9').value = project.fiscal_year || '2026';

        // Hierarchy logic for RAB
        const groupedRAB = {};
        ahspLines.forEach(line => {
            const bab = line.bab_pekerjaan || 'I. UMUM';
            const subBab = line.sub_bab || '';
            const category = line.kategori || '';
            if (!groupedRAB[bab]) groupedRAB[bab] = {};
            if (!groupedRAB[bab][subBab]) groupedRAB[bab][subBab] = {};
            if (!groupedRAB[bab][subBab][category]) groupedRAB[bab][subBab][category] = [];
            groupedRAB[bab][subBab][category].push(line);
        });

        let rabRow = 14;
        let totalBiayaPekerjaan = 0;

        Object.entries(groupedRAB).forEach(([babTitle, subBabs], bIdx) => {
            rabRow++;
            wsRAB.getCell(`A${rabRow}`).value = romanize(bIdx + 1);
            wsRAB.getCell(`B${rabRow}`).value = (babTitle || '-').toUpperCase();
            wsRAB.getCell(`B${rabRow}`).font = { bold: true };

            Object.entries(subBabs).forEach(([subTitle, categories], sIdx) => {
                if (subTitle) {
                    rabRow++;
                    wsRAB.getCell(`A${rabRow}`).value = `${bIdx + 1}.${sIdx + 1}`;
                    wsRAB.getCell(`B${rabRow}`).value = (subTitle || '-').toUpperCase();
                    wsRAB.getCell(`B${rabRow}`).font = { bold: true };
                }

                Object.entries(categories).forEach(([catTitle, items], cIdx) => {
                    if (catTitle) {
                        rabRow++;
                        const code = subTitle ? `${bIdx + 1}.${sIdx + 1}.${cIdx + 1}` : `${bIdx + 1}.${cIdx + 1}`;
                        wsRAB.getCell(`A${rabRow}`).value = code;
                        wsRAB.getCell(`B${rabRow}`).value = (catTitle || '-').toUpperCase();
                    }

                    items.forEach((l, lIdx) => {
                        rabRow++;
                        wsRAB.getCell(`A${rabRow}`).value = lIdx + 1;
                        wsRAB.getCell(`B${rabRow}`).value = l.uraian;
                        wsRAB.getCell(`C${rabRow}`).value = l.master_ahsp?.kode_ahsp || '-';
                        wsRAB.getCell(`D${rabRow}`).value = l.satuan;
                        wsRAB.getCell(`E${rabRow}`).value = Number(l.volume || 0);
                        wsRAB.getCell(`F${rabRow}`).value = Number(l.harga_satuan || 0);
                        wsRAB.getCell(`G${rabRow}`).value = Number(l.jumlah || 0);
                        totalBiayaPekerjaan += Number(l.jumlah || 0);
                    });
                });
            });
            rabRow++; 
        });

        // Summary footer with dynamic PPN
        const ppnAmount = Math.round(totalBiayaPekerjaan * (ppnPercent / 100));
        const grandTotal = totalBiayaPekerjaan + ppnAmount;
        const rounded = Math.round(grandTotal / 1000) * 1000;

        rabRow += 1;
        wsRAB.getCell(`B${rabRow}`).value = 'TOTAL HARGA PEKERJAAN';
        wsRAB.getCell(`G${rabRow}`).value = totalBiayaPekerjaan;
        wsRAB.getCell(`B${rabRow}`).font = { bold: true };

        rabRow++;
        wsRAB.getCell(`B${rabRow}`).value = `PPN ${ppnPercent}%`;
        wsRAB.getCell(`G${rabRow}`).value = ppnAmount;

        rabRow++;
        wsRAB.getCell(`B${rabRow}`).value = 'TOTAL KESELURUHAN';
        wsRAB.getCell(`G${rabRow}`).value = grandTotal;
        wsRAB.getCell(`B${rabRow}`).font = { bold: true };

        rabRow++;
        wsRAB.getCell(`B${rabRow}`).value = 'DIBULATKAN';
        wsRAB.getCell(`G${rabRow}`).value = rounded;
        wsRAB.getCell(`B${rabRow}`).font = { bold: true };

        rabRow += 2;
        wsRAB.getCell(`B${rabRow}`).value = 'Terbilang:';
        wsRAB.getCell(`C${rabRow}`).value = formatTerbilang(rounded);
        wsRAB.getCell(`C${rabRow}`).font = { italic: true, bold: true };

        setupPrinter(wsRAB, companyName);
    }
  }

  // 4. Process S-Curve & Gantt Chart (Visual)
  if (selectedSheets.includes('SCHEDULE')) {
    const wsGantt = workbook.addWorksheet('SCHEDULE');
    wsGantt.getCell('A1').value = 'JADWAL PELAKSANAAN & KURVA S';
    wsGantt.getCell('A1').font = { size: 14, bold: true };
    
    const headerRow = ['NO', 'URAIAN PEKERJAAN', 'BOBOT (%)'];
    const projectStart = new Date(project.start_date || new Date());
    
    for (let m = 1; m <= 4; m++) {
        headerRow.push(`M${m}-W1`, `M${m}-W2`, `M${m}-W3`, `M${m}-W4`);
    }
    wsGantt.getRow(4).values = headerRow;
    wsGantt.getRow(4).font = { bold: true };
    wsGantt.getRow(4).alignment = { horizontal: 'center' };

    let currentRow = 5;
    const totalProjectValue = ahspLines.reduce((s, it) => s + (it.jumlah || 0), 0) || 1;

    ahspLines.forEach((item, idx) => {
        const bobot = (item.jumlah / totalProjectValue) * 100;
        wsGantt.getCell(`A${currentRow}`).value = idx + 1;
        wsGantt.getCell(`B${currentRow}`).value = item.uraian;
        wsGantt.getCell(`C${currentRow}`).value = Number(bobot.toFixed(2));

        const startDay = Math.floor((new Date(item.seq_start || projectStart) - projectStart) / 86400000);
        const endDay = startDay + (item.durasi_hari || 1);
        
        for (let w = 0; w < 16; w++) {
            const weekStart = w * 7;
            const weekEnd = (w + 1) * 7;
            const overlap = Math.max(0, Math.min(weekEnd, endDay) - Math.max(weekStart, startDay));
            
            if (overlap > 0) {
                const cell = wsGantt.getCell(currentRow, 4 + w);
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF4F46E5' }
                };
            }
        }
        currentRow++;
    });

    wsGantt.getColumn(2).width = 40;
    setupPrinter(wsGantt, companyName);
  }

  // Finalize: Remove unused sheets safely
  const sheetsToKeep = [];
  workbook.eachSheet((sheet) => {
      let shouldKeep = false;
      const lowerName = sheet.name.toLowerCase();
      // Precise mapping to keep only what user selected
      if (lowerName.includes('harga_satuan') && selectedSheets.indexOf('HARGA SATUAN') !== -1) shouldKeep = true;
      if (lowerName === 'hsp' && selectedSheets.indexOf('HSP') !== -1) shouldKeep = true;
      if (lowerName === 'ahsp' && selectedSheets.indexOf('AHSP') !== -1) shouldKeep = true;
      if (lowerName === 'schedule' && selectedSheets.indexOf('SCHEDULE') !== -1) shouldKeep = true;
      if (lowerName.includes('rab') && selectedSheets.indexOf('RAB') !== -1) shouldKeep = true;
      
      if (shouldKeep) sheetsToKeep.push(sheet.name);
  });

  // Ensure unselected sheets are definitely removed
  const allSheetNames = workbook.worksheets.map(s => s.name);
  allSheetNames.forEach(name => {
    if (!sheetsToKeep.includes(name)) {
      workbook.removeWorksheet(name);
    }
  });

  // Safety: Excel needs at least one visible sheet.
  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet('REPORT');
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MASTER_PRO_${project.name}_${(projectLocation || '-').toUpperCase()}.xlsx`;
  a.click();
}

/**
 * Configure Page Setup for Professional Printing
 */
function setupPrinter(ws, companyName) {
    ws.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
        printTitlesRow: '1:6' 
    };

    ws.headerFooter = {
        oddHeader: `&L&B${companyName}&R&BBuildCalc Pro`,
        oddFooter: `&L&8Dicetak pada: ${new Date().toLocaleDateString('id-ID')}&C&8Halaman &P dari &N&R&8Zona Geometry System`
    };
}
