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
      const ws = workbook.getWorksheet('Harga Satuan') || workbook.getWorksheet('HARGA SATUAN');
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
            ws.getCell(`D${currentRow}`).value = group.label;
            ws.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
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
              applyBorder(ws, currentRow, 'B', 'I');
              currentRow++;
            });
          }
        });
        setupPrinter(ws, companyName, 'A:J', paperSize);
        if (headerImageId !== null) {
          ws.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
        }
      }
    }

    // 1b. Sheet: Harga Satuan Terpakai (Detailed / Project Consumption)
    if (selectedSheets.includes('HARGA SATUAN TERPAKAI')) {
      const ws = workbook.getWorksheet('harga satuan terpakai') || workbook.getWorksheet('Harga Satuan Terpakai');
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
          ws.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
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
        applyBorder(wsAHSP, ahspRow, 'B', 'N');
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
              wsAHSP.getCell(`C${ahspRow}`).value = (catTitle || '-').toUpperCase();
              wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: '1E3A8A' }, bold: true };
              applyBorder(wsAHSP, ahspRow, 'B', 'N');
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
    const wsRAB = workbook.worksheets.find(s => s.name.startsWith('RAB')) || workbook.getWorksheet('RAB');
    if (wsRAB) {
      clearDataRows(wsRAB, 12, 1000);
      
      // Project Metadata in E4:E8
      wsRAB.getCell('E4').value = (project.program || '-').toUpperCase();
      wsRAB.getCell('E5').value = (project.kegiatan || '-').toUpperCase();
      wsRAB.getCell('E6').value = (project.sub_kegiatan || '-').toUpperCase();
      wsRAB.getCell('E7').value = (projectLocation || '-').toUpperCase();
      wsRAB.getCell('E8').value = project.fiscal_year || '2026';

      let rabRow = 12;
      
      // Custom Border Helper for RAB
      const applyRabBorder = (rowNum) => {
        const row = wsRAB.getRow(rowNum);
        for (let i = 2; i <= 11; i++) { // B to K
          const col = String.fromCharCode(64 + i);
          const cell = row.getCell(i);
          if (['C', 'D', 'E'].includes(col)) {
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
          } else {
            cell.border = {
              top: { style: 'thin' }, left: { style: 'thin' },
              bottom: { style: 'thin' }, right: { style: 'thin' }
            };
          }
        }
      };

      const groupedRAB = {};
      enrichedLines.forEach(line => {
        const bab = line.bab_pekerjaan || 'I. PEKERJAAN PERSIAPAN';
        const subBab = line.sub_bab || '';
        const category = line.kategori || '';
        if (!groupedRAB[bab]) groupedRAB[bab] = {};
        if (!groupedRAB[bab][subBab]) groupedRAB[bab][subBab] = {};
        if (!groupedRAB[bab][subBab][category]) groupedRAB[bab][subBab][category] = [];
        groupedRAB[bab][subBab][category].push(line);
      });

      Object.entries(groupedRAB).forEach(([babTitle, subBabs], bIdx) => {
        // Bab Row
        wsRAB.getCell(`B${rabRow}`).value = romanize(bIdx + 1);
        wsRAB.getCell(`C${rabRow}`).value = (babTitle || '-').toUpperCase();
        wsRAB.getRow(rabRow).font = { bold: true };
        applyRabBorder(rabRow);
        rabRow++;

        Object.entries(subBabs).forEach(([subTitle, categories], sIdx) => {
          if (subTitle) {
            wsRAB.getCell(`B${rabRow}`).value = `${bIdx + 1}.${sIdx + 1}`;
            wsRAB.getCell(`C${rabRow}`).value = (subTitle || '-').toUpperCase();
            wsRAB.getRow(rabRow).font = { bold: true };
            applyRabBorder(rabRow);
            rabRow++;
          }

          Object.entries(categories).forEach(([catTitle, items]) => {
            if (catTitle) {
              wsRAB.getCell(`C${rabRow}`).value = catTitle.toUpperCase();
              wsRAB.getRow(rabRow).font = { bold: true };
              applyRabBorder(rabRow);
              rabRow++;
            }

            items.forEach((line) => {
              const itemCode = isCatalog ? line.kode_ahsp : (line.master_ahsp?.kode_ahsp || '-');
              wsRAB.getCell(`B${rabRow}`).value = itemCode;
              wsRAB.getCell(`C${rabRow}`).value = line.uraian || line.nama_pekerjaan;
              
              // Formulas
              wsRAB.getCell(`F${rabRow}`).value = { formula: `IFERROR(VLOOKUP(B${rabRow}, ahsp!B:F, 5, FALSE), "")`, result: line.satuan || '' };
              wsRAB.getCell(`G${rabRow}`).value = Number(line.volume || 1);
              wsRAB.getCell(`H${rabRow}`).value = { formula: `IFERROR(VLOOKUP(B${rabRow}, ahsp!B:M, 12, FALSE), 0)`, result: Number(line.harga_satuan || 0) };
              wsRAB.getCell(`I${rabRow}`).value = { formula: `G${rabRow}*H${rabRow}`, result: 0 };
              wsRAB.getCell(`J${rabRow}`).value = { formula: `IFERROR(VLOOKUP(B${rabRow}, ahsp!B:N, 13, FALSE), 0)`, result: 0 };
              wsRAB.getCell(`K${rabRow}`).value = { formula: `I${rabRow}*J${rabRow}`, result: 0 };

              // Formatting
              wsRAB.getCell(`H${rabRow}`).numFmt = '#,##0.00';
              wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
              wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%';
              wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
              
              wsRAB.getRow(rabRow).font = { bold: false };
              applyRabBorder(rabRow);
              rabRow++;
            });
          });
        });
      });

      // Total Keseluruhan
      rabRow++;
      wsRAB.getCell(`C${rabRow}`).value = 'JUMLAH TOTAL';
      wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I12:I${rabRow - 1})`, result: 0 };
      wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K12:K${rabRow - 1})`, result: 0 };
      wsRAB.getRow(rabRow).font = { bold: true };
      wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
      wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
      applyRabBorder(rabRow);

      setupPrinter(wsRAB, companyName, 'B:K', paperSize);
    }
  }

  // ==========================================
  // 4. Finalize Worksheets (Delete Unselected & Set Orientation)
  // ==========================================
  const sheetMap = {
    'RAB': ['RAB', 'rab'],
    'HSP': ['HSP', 'hsp'],
    'AHSP': ['AHSP', 'ahsp'],
    'HARGA SATUAN': ['Harga Satuan', 'harga satuan terpakai', 'harga_satuan_terpakai'],
    'REKAP': ['REKAP', 'rekap', 'Rekapitulasi'],
    'SCHEDULE': ['SCHEDULE', 'schedule', 'Kurva-S']
  };

  const selectedSheetNames = selectedSheets.flatMap(s => sheetMap[s] || [s]);
  
  workbook.worksheets.forEach(ws => {
    const isSelected = selectedSheetNames.some(name => ws.name.toLowerCase() === name.toLowerCase());
    
    if (!isSelected) {
      workbook.removeWorksheet(ws.id);
    } else {
      // Set Landscape for Schedule/Rekap
      if (['schedule', 'kurva-s', 'rekap', 'rekapitulasi'].some(n => ws.name.toLowerCase().includes(n))) {
        setupPrinter(ws, companyName, null, paperSize, 'landscape');
      }
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