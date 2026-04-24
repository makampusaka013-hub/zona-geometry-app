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
  ws.headerFooter.oddFooter = `&L&10by : &"Arial,Bold"&KFF8C00ZG &R&10Halaman &P dari &N`;
};

const generateProjectReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const projectLocation = project.location || project.address || '-';
  const ppnPercent = project.ppn || 11;

  const { isCatalog = false, catAhsp = [], catPrice = [], projectPrices = [], headerImage = null, paperSize = 'A4' } = options;
  const safeProjectPrices = Array.isArray(projectPrices) ? projectPrices : [];
  const priceMap = Object.fromEntries(safeProjectPrices.map(p => [p.kode_item, p.harga_satuan]));
  

  if (isCatalog && Array.isArray(catPrice)) {
    catPrice.forEach(p => { priceMap[p.kode_item] = p.harga_satuan; });
  }

  const response = await fetch(`/templates/master_template_custom.xlsx?v=${Date.now()}`);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  let headerImageId = null;
  if (headerImage) {
    try {
      let base64Murni = '';
      let extension = 'png';

      // 1. Cek apakah ini URL (Link Supabase/Internet) atau sudah Base64
      if (headerImage.startsWith('http')) {
        console.log("Mendownload gambar dari URL untuk Excel...");
        const res = await fetch(headerImage);
        const blob = await res.blob();
        
        // Deteksi format asli dari file yang didownload
        extension = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'jpeg' : 'png';
        
        // Convert Blob ke Base64 di browser
        base64Murni = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        // 2. Jika dari sananya sudah berupa Base64 murni
        base64Murni = headerImage.includes(',') ? headerImage.split(',')[1] : headerImage;
        extension = headerImage.includes('jpeg') || headerImage.includes('jpg') ? 'jpeg' : 'png';
      }

      // 3. Masukkan ke Workbook
      headerImageId = workbook.addImage({
        base64: base64Murni,
        extension: extension,
      });
      
    } catch (e) {
      console.error('Gagal memproses gambar kop surat:', e);
    }
  }

  const enrichedLines = ahspLines;

  // ==========================================
  // 1. Process Resources
  // ==========================================
  if (selectedSheets.includes('HARGA SATUAN') || selectedSheets.includes('HARGA SATUAN TERPAKAI')) {
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
    if (selectedSheets.includes('HARGA SATUAN')) {
      const ws = workbook.getWorksheet('Harga Satuan') || 
                 workbook.getWorksheet('HARGA SATUAN') || 
                 workbook.getWorksheet('harga satuan');
      if (ws) {
        clearDataRows(ws, 6, 1000);
        let currentRow = 6;
        const groups = [
          { label: 'TENAGA KERJA', types: ['upah', 'tenaga'] },
          { label: 'BAHAN', types: ['bahan'] },
          { label: 'PERALATAN', types: ['alat', 'peralatan', 'mesin'] }
        ];
        applyBorder(ws, 6, 'B', 'I');
        groups.forEach(group => {
          const items = Object.values(resources).filter(r => group.types.some(t => r.jenis.includes(t)));
          if (items.length > 0) {
            currentRow++;
            const headerCell = ws.getCell(`D${currentRow}`);
            headerCell.value = group.label;
            ws.getRow(currentRow).font = { bold: true };
            ws.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
            
            // D to I: Top/Bottom, I: Right
            for (let i = 4; i <= 9; i++) {
              const cell = ws.getRow(currentRow).getCell(i);
              cell.border = { 
                top: { style: 'thin' }, 
                bottom: { style: 'thin' },
                right: (i === 9) ? { style: 'thin' } : undefined
              };
            }
            // Also apply standard border to index/B if needed or keep it simple
            ws.getCell(`B${currentRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

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
              applyBorder(ws, currentRow, 'B', 'I');
              currentRow++;
            });
          }
        });
        setupPrinter(ws, companyName, 'A:J', paperSize);
        if (headerImageId !== null) {
          ws.addImage(headerImageId, { 
            tl: { col: 1, row: 0 }, // Mulai dari B1
            br: { col: 9, row: 1 }, // Sampai I1 (batas J1)
            editAs: 'twoCell' 
          });
        }
      }
    }

    // 1b. Sheet: Harga Satuan Terpakai (Detailed / Project Consumption)
    if (selectedSheets.includes('HARGA SATUAN TERPAKAI')) {
      const ws = workbook.getWorksheet('harga satuan terpakai') || 
                 workbook.getWorksheet('Harga Satuan Terpakai') || 
                 workbook.getWorksheet('HARGA SATUAN TERPAKAI');
      if (ws) {
        clearDataRows(ws, 6, 1000);
        let currentRow = 6;
        const groups = [
          { label: 'TENAGA KERJA', types: ['upah', 'tenaga'] },
          { label: 'BAHAN', types: ['bahan'] },
          { label: 'PERALATAN', types: ['alat', 'peralatan', 'mesin'] }
        ];
        applyBorder(ws, 6, 'B', 'L');
        groups.forEach(group => {
          const items = Object.values(resources).filter(r => group.types.some(t => r.jenis.includes(t)));
          if (items.length > 0) {
            currentRow++;
            ws.getCell(`C${currentRow}`).value = group.label;
            ws.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
            applyBorder(ws, currentRow, 'B', 'L');
            currentRow++;
            items.forEach((r, idx) => {
              ws.getCell(`B${currentRow}`).value = idx + 1;
              ws.getCell(`C${currentRow}`).value = r.uraian;
              ws.getCell(`E${currentRow}`).value = r.kode;
              ws.getCell(`F${currentRow}`).value = r.satuan;
              ws.getCell(`G${currentRow}`).value = Number(r.totalVolume.toFixed(4));
              ws.getCell(`H${currentRow}`).value = Number(r.harga);
              ws.getCell(`I${currentRow}`).value = { formula: `G${currentRow}*H${currentRow}`, result: r.totalVolume * r.harga };
              ws.getCell(`K${currentRow}`).value = totalProjectCostForPercent > 0 ? (r.totalVolume * r.harga) / totalProjectCostForPercent : 0;
              ws.getCell(`L${currentRow}`).value = Number(r.tkdn) / 100;
              
              ws.getCell(`G${currentRow}`).numFmt = '#,##0.0000';
              ws.getCell(`H${currentRow}`).numFmt = '#,##0.00';
              ws.getCell(`I${currentRow}`).numFmt = '#,##0.00';
              ws.getCell(`K${currentRow}`).numFmt = '0.00%';
              ws.getCell(`L${currentRow}`).numFmt = '0.00%';
              applyBorder(ws, currentRow, 'B', 'L');
              currentRow++;
            });
          }
        });
        setupPrinter(ws, companyName, 'A:M', paperSize);
        if (headerImageId !== null) {
          ws.addImage(headerImageId, { 
            tl: { col: 1, row: 0 }, // Mulai dari B1
            br: { col: 12, row: 1 }, // Sampai L1 (batas M1)
            editAs: 'twoCell' 
          });
        }
      }
    }
  }

  // ==========================================
  // 2. Process HSP & AHSP
  // ==========================================
  if (selectedSheets.includes('HSP') || selectedSheets.includes('AHSP')) {
    let hspRow = 6;
    let ahspRow = 6;
    const wsHSP = workbook.getWorksheet('hsp') || workbook.getWorksheet('HSP');
    const wsAHSP = workbook.getWorksheet('ahsp') || workbook.getWorksheet('AHSP');

    if (wsHSP) {
      for (let r = 1; r <= 4; r++) {
        const row = wsHSP.getRow(r);
        for (let c = 1; c <= 20; c++) {
          row.getCell(c).border = { top: { style: 'none' }, left: { style: 'none' }, bottom: { style: 'none' }, right: { style: 'none' } };
          row.getCell(c).fill = { type: 'pattern', pattern: 'none' };
        }
      }
      // Row 5: Only clear Column G border, keep Fill
      wsHSP.getRow(5).getCell(7).border = { top: { style: 'none' }, left: { style: 'none' }, bottom: { style: 'none' }, right: { style: 'none' } };
      clearDataRows(wsHSP, 6, 1000);
    }
    if (wsAHSP) {
      for (let r = 1; r <= 4; r++) {
        const row = wsAHSP.getRow(r);
        for (let c = 1; c <= 20; c++) {
          row.getCell(c).border = { top: { style: 'none' }, left: { style: 'none' }, bottom: { style: 'none' }, right: { style: 'none' } };
          row.getCell(c).fill = { type: 'pattern', pattern: 'none' };
        }
      }
      // Row 5: Only clear Column G border, keep Fill
      wsAHSP.getRow(5).getCell(7).border = { top: { style: 'none' }, left: { style: 'none' }, bottom: { style: 'none' }, right: { style: 'none' } };
      clearDataRows(wsAHSP, 6, 5000);
    }
    

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
          
          // C to N: Top/Bottom, N: Right
          for (let i = 3; i <= 14; i++) {
            const cell = wsAHSP.getRow(ahspRow).getCell(i);
            cell.border = { 
              top: { style: 'thin' }, 
              bottom: { style: 'thin' },
              right: (i === 14) ? { style: 'thin' } : undefined
            };
          }
          wsAHSP.getCell(`B${ahspRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

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
              wsAHSP.getCell(`C${ahspRow}`).value = (subTitle || '-').toUpperCase();
              wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: '1E3A8A' }, bold: true };
              
              // C to N: Top/Bottom, N: Right
              for (let i = 3; i <= 14; i++) {
                const cell = wsAHSP.getRow(ahspRow).getCell(i);
                cell.border = { 
                  top: { style: 'thin' }, 
                  bottom: { style: 'thin' },
                  right: (i === 14) ? { style: 'thin' } : undefined
                };
              }
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
                wsAHSP.getCell(`C${ahspRow}`).value = (catTitle || '-').toUpperCase();
                wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: '1E3A8A' }, bold: true };
                
                // C to N: Top/Bottom, N: Right
                for (let i = 3; i <= 14; i++) {
                  const cell = wsAHSP.getRow(ahspRow).getCell(i);
                  cell.border = { 
                    top: { style: 'thin' }, 
                    bottom: { style: 'thin' },
                    right: (i === 14) ? { style: 'thin' } : undefined
                  };
                }
                ahspRow++;
              }
            }
            items.forEach((line) => {
              const itemCode = isCatalog ? line.kode_ahsp : (line.master_ahsp?.kode_ahsp || '-');
              if (wsHSP) {
                wsHSP.getCell(`B${hspRow}`).value = itemCode;
                wsHSP.getCell(`C${hspRow}`).value = null; 
                wsHSP.getCell(`D${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 3, FALSE), "")`, result: line.uraian || line.nama_pekerjaan };
                wsHSP.getCell(`E${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:F, 5, FALSE), "")`, result: line.satuan || line.satuan_pekerjaan };
                wsHSP.getCell(`F${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 12, FALSE), "")`, result: Number(line.harga_satuan || line.total_subtotal || 0) };
                wsHSP.getCell(`F${hspRow}`).numFmt = '_(Rp* #,##0.00_);_(Rp* (#,##0.00);_(Rp* "-"??_);_(@_)';
                wsHSP.getCell(`G${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 13, FALSE), "")`, result: Number(line.tkdn || line.total_tkdn_percent || 100) / 100 };
                wsHSP.getCell(`G${hspRow}`).numFmt = '0.00%';
                wsHSP.getCell(`H${hspRow}`).value = "";
                applyBorder(wsHSP, hspRow, 'B', 'H'); 
                hspRow++;
              }
              if (wsAHSP) {
                const mainHeaderRow = ahspRow;
                wsAHSP.getCell(`B${mainHeaderRow}`).value = itemCode;
                wsAHSP.getCell(`D${mainHeaderRow}`).value = ((line.uraian || line.nama_pekerjaan || '-') + "").toUpperCase();
                wsAHSP.getCell(`F${mainHeaderRow}`).value = line.satuan || line.satuan_pekerjaan;
                wsAHSP.getCell(`L${mainHeaderRow}`).value = (line.overhead_profit || 15) / 100;
                wsAHSP.getCell(`L${mainHeaderRow}`).numFmt = '0.00%';
                
                // D to E: Top/Bottom
                wsAHSP.getCell(`D${mainHeaderRow}`).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
                wsAHSP.getCell(`E${mainHeaderRow}`).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
                
                // Keep other cells' borders standard or as needed
                wsAHSP.getCell(`B${mainHeaderRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                wsAHSP.getCell(`F${mainHeaderRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                wsAHSP.getCell(`L${mainHeaderRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                wsAHSP.getCell(`M${mainHeaderRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                wsAHSP.getCell(`N${mainHeaderRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

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
                    
                    // D to N: Top/Bottom, N: Right
                    for (let i = 4; i <= 14; i++) {
                      const cell = wsAHSP.getRow(ahspRow).getCell(i);
                      cell.border = { 
                        top: { style: 'thin' }, 
                        bottom: { style: 'thin' },
                        right: (i === 14) ? { style: 'thin' } : undefined
                      };
                    }
                    wsAHSP.getCell(`B${ahspRow}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

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
                      formula: `IFERROR(VLOOKUP(E${ahspRow}, 'Harga Satuan'!E:G, 3, FALSE), "")`,
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
              wsAHSP.getCell(`M${mainHeaderRow}`).value = { formula: `ROUND((I${mainHeaderRow}+J${mainHeaderRow}+K${mainHeaderRow})*(1+L${mainHeaderRow}), 0)`, result: 0 };
              wsAHSP.getCell(`M${mainHeaderRow}`).numFmt = '_(Rp* #,##0.00_);_(Rp* (#,##0.00);_(Rp* "-"??_);_(@_)';
              wsAHSP.getCell(`M${mainHeaderRow}`).font = { bold: false };
              if (startDetailRow <= endDetailRow) {
                wsAHSP.getCell(`N${mainHeaderRow}`).value = { formula: `AVERAGE(N${startDetailRow}:N${endDetailRow})`, result: 0 };
              } else {
                wsAHSP.getCell(`N${mainHeaderRow}`).value = Number(line.tkdn || line.total_tkdn_percent || 0) / 100;
              }
              wsAHSP.getCell(`N${mainHeaderRow}`).numFmt = '0.00%';
              wsAHSP.getCell(`N${mainHeaderRow}`).font = { bold: false };
              ahspRow++;
            }
          });
        });
      });
    });

    if (headerImageId !== null) {
      if (wsAHSP) {
        wsAHSP.addImage(headerImageId, {
          tl: { col: 0, row: 0 },
          br: { col: 14, row: 1 }, // Menutupi sampai kolom N
          editAs: 'twoCell'
        });
      }
      if (wsHSP) {
        wsHSP.addImage(headerImageId, {
          tl: { col: 0, row: 0 },
          br: { col: 8, row: 1 }, // Menutupi sampai kolom H
          editAs: 'twoCell'
        });
      }
    }
  }

  // ==========================================
  // 3. Process RAB
  // ==========================================
  if (selectedSheets.includes('RAB')) {
    const wsRAB = workbook.worksheets.find(s => s.name.toLowerCase() === 'rab' || s.name.toLowerCase().startsWith('rab_'));
    if (wsRAB) {
      clearDataRows(wsRAB, 12, 1000);
      
      // Project Metadata Mapping
      wsRAB.getCell('E4').value = (project?.nama_program || project?.program || '-').toUpperCase();
      wsRAB.getCell('E5').value = (project?.nama_kegiatan || project?.kegiatan || '-').toUpperCase();
      wsRAB.getCell('E6').value = (project?.nama_sub_kegiatan || project?.sub_kegiatan || '-').toUpperCase();
      wsRAB.getCell('E7').value = ''; // Spacer or extra metadata
      wsRAB.getCell('E8').value = (project?.lokasi || projectLocation || '-').toUpperCase();
      wsRAB.getCell('E9').value = project?.tahun_anggaran || project?.fiscal_year || '2026';

      let rabRow = 12;
      
      // Custom Border Helper for RAB
      const applyRabBorder = (rowNum, type = 'item') => {
        const row = wsRAB.getRow(rowNum);
        for (let i = 2; i <= 11; i++) { // B to K
          const col = String.fromCharCode(64 + i);
          const cell = row.getCell(i);
          
          if (type === 'bab') {
            // Bab rows: B is full, C-J top/bottom, K top/bottom/right
            if (col === 'B') {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            } else if (i >= 3 && i <= 10) { // C-J
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
            } else if (col === 'K') {
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            }
          } else if (type === 'total') {
            // Total/Subtotal: B is full?, C-H top/bottom, I-K full
            if (col === 'B') {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            } else if (i >= 3 && i <= 8) { // C-H
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
            } else { // I, J, K
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            }
          } else {
            // Standard Item
            if (['C', 'D', 'E'].includes(col)) {
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
            } else {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            }
          }
        }
      };

      const groupedRAB = {};
      enrichedLines.forEach(line => {
        const bab = line.bab_pekerjaan || 'I. PEKERJAAN PERSIAPAN';
        if (!groupedRAB[bab]) groupedRAB[bab] = [];
        groupedRAB[bab].push(line);
      });

      Object.entries(groupedRAB).forEach(([babTitle, items], bIdx) => {
        // Bab Header Row
        wsRAB.getCell(`B${rabRow}`).value = romanize(bIdx + 1);
        wsRAB.getCell(`C${rabRow}`).value = (babTitle || '-').toUpperCase();
        wsRAB.getRow(rabRow).font = { bold: true };
        applyRabBorder(rabRow, 'bab');
        rabRow++;

        const startBabRow = rabRow;

        items.forEach((line, iIdx) => {
          wsRAB.getCell(`B${rabRow}`).value = iIdx + 1;
          wsRAB.getCell(`C${rabRow}`).value = line.uraian || '-';
          wsRAB.getCell(`F${rabRow}`).value = line.satuan || '-';
          wsRAB.getCell(`G${rabRow}`).value = Number(line.volume || 0);
          
          wsRAB.getCell(`H${rabRow}`).value = { 
            formula: `IFERROR(VLOOKUP(C${rabRow}, 'hsp'!D:F, 3, FALSE), 0)`,
            result: Number(line.harga_satuan || 0)
          };
          wsRAB.getCell(`I${rabRow}`).value = { 
            formula: `G${rabRow}*H${rabRow}`,
            result: (Number(line.volume || 0) * Number(line.harga_satuan || 0))
          };
          wsRAB.getCell(`J${rabRow}`).value = { 
            formula: `IFERROR(VLOOKUP(C${rabRow}, 'hsp'!D:G, 4, FALSE), 0)`,
            result: Number(line.tkdn || 0) / 100
          };
          wsRAB.getCell(`K${rabRow}`).value = { 
            formula: `I${rabRow}*J${rabRow}`,
            result: (Number(line.volume || 0) * Number(line.harga_satuan || 0) * (Number(line.tkdn || 0) / 100))
          };

          wsRAB.getCell(`G${rabRow}`).numFmt = '#,##0.00';
          wsRAB.getCell(`H${rabRow}`).numFmt = '#,##0.00';
          wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
          wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%';
          wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
          
          wsRAB.getRow(rabRow).font = { bold: false };
          applyRabBorder(rabRow, 'item');
          rabRow++;
        });

        const endBabRow = rabRow - 1;

        // Subtotal Row for Bab
        wsRAB.getCell(`C${rabRow}`).value = `SUB TOTAL ${babTitle || ''}`.toUpperCase();
        wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I${startBabRow}:I${endBabRow})`, result: 0 };
        wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K${startBabRow}:K${endBabRow})`, result: 0 };
        wsRAB.getRow(rabRow).font = { bold: true };
        wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
        wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
        applyRabBorder(rabRow, 'total');
        
        rabRow++;
        rabRow++;
      });

      // Total Keseluruhan
      wsRAB.getCell(`C${rabRow}`).value = 'JUMLAH TOTAL';
      wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I12:I${rabRow - 1})/2`, result: 0 };
      wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K12:K${rabRow - 1})/2`, result: 0 };
      wsRAB.getRow(rabRow).font = { bold: true };
      wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
      wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
      applyRabBorder(rabRow, 'total');

      // Logo placement for RAB (B1:K1)
      if (headerImageId !== null) {
        wsRAB.addImage(headerImageId, {
          tl: { col: 1, row: 0 },
          br: { col: 11, row: 1 },
          editAs: 'twoCell'
        });
      }

      setupPrinter(wsRAB, companyName, 'B:K', paperSize);
    }
  }

  // ==========================================
  // 4. Finalize Worksheets (Cleanup & Print Setup)
  // ==========================================
  const sheetMap = {
    'RAB': ['RAB', 'rab'],
    'HSP': ['HSP', 'hsp'],
    'AHSP': ['AHSP', 'ahsp'],
    'HARGA SATUAN': ['Harga Satuan', 'HARGA SATUAN', 'harga satuan'],
    'HARGA SATUAN TERPAKAI': ['harga satuan terpakai', 'Harga Satuan Terpakai', 'HARGA SATUAN TERPAKAI'],
    'REKAP': ['REKAP', 'rekap', 'Rekapitulasi'],
    'SCHEDULE': ['SCHEDULE', 'schedule', 'Kurva-S']
  };

  const selectedSheetNames = selectedSheets.flatMap(s => sheetMap[s] || [s]);
  
  // Create a copy of worksheets array to avoid index shifting issues while removing
  const worksheets = [...workbook.worksheets];
  
  worksheets.forEach(ws => {
    const isSelected = selectedSheetNames.some(name => ws.name.toLowerCase() === name.toLowerCase());
    
    if (!isSelected) {
      workbook.removeWorksheet(ws.id);
      return;
    }

    // Check if sheet has actual data (beyond header rows)
    // We assume data starts from row 6 or 12 depending on sheet
    let hasData = false;
    const startRow = ws.name.toLowerCase().includes('rab') ? 12 : 6;
    let highestRowWithData = startRow; // Pelacak indeks baris paling bawah

    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber >= startRow) {
        let rowHasContent = false;
        // Periksa kolom B sampai N (index 2 sampai 14) untuk mencari data
        for (let i = 2; i <= 14; i++) {
          const val = row.getCell(i).value;
          if (val !== null && val !== "") {
            rowHasContent = true;
            break;
          }
        }
        if (rowHasContent) {
          hasData = true;
          highestRowWithData = Math.max(highestRowWithData, rowNumber);
        }
      }
    });

    if (!hasData) {
      // Jika kosong (tidak ada data), jangan di print (hapus saja agar tidak muncul di file)
      workbook.removeWorksheet(ws.id);
    } else {
      // Tentukan Print Area berdasarkan baris paling bawah yang ditemukan + 1 spasi
      const lastRow = highestRowWithData + 1;
      
      let lastCol = 'K'; // Default
      const name = ws.name.toLowerCase();
      if (name.includes('ahsp')) {
        lastCol = 'O';
      } else if (name.includes('hsp')) {
        lastCol = 'I';
      } else if (name.includes('terpakai')) {
        lastCol = 'M';
      } else if (name === 'harga satuan' || name === 'harga_satuan' || name === 'harga satuan master') {
        lastCol = 'J';
      }
      
      const pArea = `A1:${lastCol}${lastRow}`;
      
      const orient = (['schedule', 'kurva-s', 'rekap', 'rekapitulasi'].some(n => ws.name.toLowerCase().includes(n))) ? 'landscape' : 'portrait';
      
      setupPrinter(ws, companyName, pArea, paperSize, orient);
    }
  });

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