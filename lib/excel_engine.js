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
  const isCover = ws.name.toLowerCase() === 'cover';

  ws.pageSetup = {
    paperSize: pSize,
    orientation: orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: isCover ? 1 : 0, // Cover dipaksa 1 halaman tinggi
    printTitlesRow: isCover ? null : '5:5',
    margins: isCover ? {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      header: 0,
      footer: 0
    } : {
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
  // Jangan beri footer pada cover
  ws.headerFooter.oddFooter = isCover ? '' : `&L&8By : &"Arial,Bold"&KFF8C00ZG &R&8&P / &N`;
};

const getBabWeight = (bab) => {
  if (!bab) return 999;
  const s = String(bab).trim().toUpperCase();
  const m = s.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)/);
  if (!m) return 998;
  const roman = m[1];
  const map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15 };
  return map[roman] || 997;
};

const generateProjectReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const projectLocation = project.location || project.address || '-';
  const ppnPercent = project?.ppn_percent ?? project?.ppn ?? 11;
  const globalOverhead = project?.profit_percent ?? project?.overhead_percent ?? 15;

  const {
    isCatalog = false,
    catAhsp = [],
    catPrice = [],
    projectPrices = [],
    headerImage = null,
    paperSize = 'A4',
    isStandalone = false
  } = options;
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
        // Border baris 6 (Header) menyambung B sampai I
        for (let i = 2; i <= 9; i++) {
          ws.getCell(6, i).border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: i === 2 ? { style: 'thin' } : undefined,
            right: i === 9 ? { style: 'thin' } : undefined
          };
        }
        groups.forEach(group => {
          const items = Object.values(resources).filter(r => group.types.some(t => r.jenis.includes(t)));
          if (items.length > 0) {
            currentRow++;
            const headerCell = ws.getCell(`D${currentRow}`);
            headerCell.value = group.label;
            ws.getRow(currentRow).font = { bold: true };
            ws.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };

            // Tambal lubang di kolom C
            for (let i = 3; i <= 9; i++) {
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
              ws.getCell(`B${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

              ws.getCell(`D${currentRow}`).value = r.uraian;

              ws.getCell(`E${currentRow}`).value = r.kode;
              ws.getCell(`E${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

              ws.getCell(`F${currentRow}`).value = r.satuan;
              ws.getCell(`F${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

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
        // Border baris 6 (Header) menyambung B sampai L
        for (let i = 2; i <= 12; i++) {
          ws.getCell(6, i).border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: i === 2 ? { style: 'thin' } : undefined,
            right: i === 12 ? { style: 'thin' } : undefined
          };
        }
        groups.forEach(group => {
          const items = Object.values(resources).filter(r => group.types.some(t => r.jenis.includes(t)));
          if (items.length > 0) {
            currentRow++;
            ws.getCell(`C${currentRow}`).value = group.label;
            ws.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };

            // Border untuk baris grup (TENAGA KERJA, dll)
            for (let i = 2; i <= 12; i++) {
              ws.getCell(currentRow, i).border = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: i === 2 ? { style: 'thin' } : undefined,
                right: i === 12 ? { style: 'thin' } : undefined
              };
            }
            currentRow++;
            items.forEach((r, idx) => {
              ws.getCell(`B${currentRow}`).value = idx + 1;
              ws.getCell(`B${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

              ws.getCell(`C${currentRow}`).value = r.uraian;

              ws.getCell(`E${currentRow}`).value = r.kode;
              ws.getCell(`E${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

              ws.getCell(`F${currentRow}`).value = r.satuan;
              ws.getCell(`F${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

              ws.getCell(`G${currentRow}`).value = Number(r.totalVolume.toFixed(4));
              ws.getCell(`G${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
              ws.getCell(`G${currentRow}`).numFmt = '#,##0.00'; // Sesuai permintaan: 2 angka di belakang koma

              ws.getCell(`H${currentRow}`).value = Number(r.harga);
              ws.getCell(`I${currentRow}`).value = { formula: `G${currentRow}*H${currentRow}`, result: r.totalVolume * r.harga };
              ws.getCell(`K${currentRow}`).value = totalProjectCostForPercent > 0 ? (r.totalVolume * r.harga) / totalProjectCostForPercent : 0;
              ws.getCell(`L${currentRow}`).value = Number(r.tkdn) / 100;

              ws.getCell(`H${currentRow}`).numFmt = '#,##0.00';
              ws.getCell(`I${currentRow}`).numFmt = '#,##0.00';
              ws.getCell(`K${currentRow}`).numFmt = '0.00%';
              ws.getCell(`L${currentRow}`).numFmt = '0.00%';
              // Border untuk item: C & D tanpa garis pemisah vertikal
              for (let i = 2; i <= 12; i++) {
                if (i === 3 || i === 4) { // Kolom C dan D
                  ws.getCell(currentRow, i).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
                } else { // Sisa kolom menggunakan kotak penuh
                  ws.getCell(currentRow, i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                }
              }
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
            wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: '000000' }, bold: true };

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
              wsAHSP.getCell(`C${ahspRow}`).font = { color: { argb: '000000' }, bold: true };

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

              const uraianValue = line.uraian || line.nama_pekerjaan;
              const satuanValue = line.satuan || line.satuan_pekerjaan;
              const hargaValue = Number(line.harga_satuan || line.total_subtotal || 0);
              const tkdnValue = Number(line.tkdn || line.total_tkdn_percent || 100) / 100;

              if (isStandalone) {
                wsHSP.getCell(`D${hspRow}`).value = uraianValue;
                wsHSP.getCell(`E${hspRow}`).value = satuanValue;
                wsHSP.getCell(`F${hspRow}`).value = hargaValue;
                wsHSP.getCell(`G${hspRow}`).value = tkdnValue;
              } else {
                wsHSP.getCell(`D${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 3, FALSE), "")`, result: uraianValue };
                wsHSP.getCell(`E${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:F, 5, FALSE), "")`, result: satuanValue };
                wsHSP.getCell(`F${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 12, FALSE), "")`, result: hargaValue };
                wsHSP.getCell(`G${hspRow}`).value = { formula: `IFERROR(VLOOKUP(B${hspRow}, ahsp!B:N, 13, FALSE), "")`, result: tkdnValue };
              }

              wsHSP.getCell(`E${hspRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
              wsHSP.getCell(`F${hspRow}`).numFmt = '_(Rp* #,##0.00_);_(Rp* (#,##0.00);_(Rp* "-"??_);_(@_)';
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

              // Reverse Engineer Profit agar selalu sinkron dengan aplikasi web
              const detailsForProfit = isCatalog ? (line.details || []) : (line.master_ahsp?.details || line.analisa_custom || []);
              let calcBase = 0;
              detailsForProfit.forEach(d => {
                const k = Number(d.koefisien || 0);
                const p = Number(d.harga_satuan_snapshot || d.harga_satuan || d.harga || priceMap[d.kode_item || d.kode || d.id] || 0);
                calcBase += (k * p);
              });

              let smartProfit = globalOverhead;
              if (line.profit_percent !== null && line.profit_percent !== undefined) {
                smartProfit = Number(line.profit_percent);
              } else if (line.profitPercent !== null && line.profitPercent !== undefined) {
                smartProfit = Number(line.profitPercent);
              } else if (calcBase > 0 && Number(line.harga_satuan) > 0) {
                smartProfit = Math.round(((Number(line.harga_satuan) / calcBase) - 1) * 100);
              }

              wsAHSP.getCell(`L${mainHeaderRow}`).value = smartProfit / 100;
              wsAHSP.getCell(`L${mainHeaderRow}`).numFmt = '0.00%';

              // Kolom B (Kode): Kotak Penuh
              wsAHSP.getCell(mainHeaderRow, 2).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

              // Kolom C sampai H (Uraian section): Tanpa border vertikal tengah, KECUALI Kolom F
              for (let i = 3; i <= 8; i++) {
                const cell = wsAHSP.getCell(mainHeaderRow, i);
                if (i === 6) { // Kolom F (Satuan)
                  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                  cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else {
                  cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    // Tambahkan garis pembatas di kanan E (untuk sisi kiri F) dan kanan H (ujung section)
                    right: (i === 5 || i === 8) ? { style: 'thin' } : undefined
                  };
                }
              }

              // Kolom I sampai N (Summary section): Border kotak penuh semua vertikal
              for (let i = 9; i <= 14; i++) {
                wsAHSP.getCell(mainHeaderRow, i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
              }

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

                  // Tambal lubang di kolom C (mulai dari i = 3)
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
                  filtered.forEach((d) => {
                    const koef = Number(d.koefisien || 0);
                    const itemPrice = Number(d.harga_satuan_snapshot || d.harga_satuan || d.harga || priceMap[d.kode_item] || 0);
                    const subtotal = koef * itemPrice;

                    wsAHSP.getCell(`D${ahspRow}`).value = d.uraian;
                    wsAHSP.getCell(`E${ahspRow}`).value = d.kode_item || d.kode;
                    wsAHSP.getCell(`E${ahspRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

                    wsAHSP.getCell(`F${ahspRow}`).value = d.satuan;
                    wsAHSP.getCell(`F${ahspRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
                    wsAHSP.getCell(`G${ahspRow}`).value = koef;
                    if (isStandalone) {
                      wsAHSP.getCell(`H${ahspRow}`).value = itemPrice;
                    } else {
                      wsAHSP.getCell(`H${ahspRow}`).value = {
                        formula: `IFERROR(VLOOKUP(E${ahspRow}, 'Harga Satuan'!E:G, 3, FALSE), "")`,
                        result: itemPrice
                      };
                    }
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
      wsRAB.getCell('E7').value = (project?.work_name || project?.name || '-').toUpperCase();
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

          if (isStandalone) {
            wsRAB.getCell(`H${rabRow}`).value = Number(line.harga_satuan || 0);
            wsRAB.getCell(`J${rabRow}`).value = Number(line.tkdn || 0) / 100;
          } else {
            wsRAB.getCell(`H${rabRow}`).value = {
              formula: `IFERROR(VLOOKUP(C${rabRow}, 'hsp'!D:F, 3, FALSE), 0)`,
              result: Number(line.harga_satuan || 0)
            };
            wsRAB.getCell(`J${rabRow}`).value = {
              formula: `IFERROR(VLOOKUP(C${rabRow}, 'hsp'!D:G, 4, FALSE), 0)`,
              result: Number(line.tkdn || 0) / 100
            };
          }

          // Rumus internal (Perkalian volume) harus selalu hidup
          wsRAB.getCell(`I${rabRow}`).value = {
            formula: `G${rabRow}*H${rabRow}`,
            result: Math.round(Number(line.volume || 0) * Number(line.harga_satuan || 0))
          };
          wsRAB.getCell(`K${rabRow}`).value = {
            formula: `I${rabRow}*J${rabRow}`,
            result: Math.round(Number(line.volume || 0) * Number(line.harga_satuan || 0) * (Number(line.tkdn || 0) / 100))
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
        // Tambahkan persentase TKDN
        wsRAB.getCell(`J${rabRow}`).value = { formula: `IFERROR(K${rabRow}/I${rabRow}, 0)`, result: 0 };
        wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K${startBabRow}:K${endBabRow})`, result: 0 };
        wsRAB.getRow(rabRow).font = { bold: true };
        wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
        wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%'; // Format TKDN
        wsRAB.getCell(`K${rabRow}`).numFmt = '#,##0.00';
        applyRabBorder(rabRow, 'total');

        rabRow++;
        rabRow++;
      });

      // Total Keseluruhan
      wsRAB.getCell(`C${rabRow}`).value = 'JUMLAH TOTAL';
      wsRAB.getCell(`I${rabRow}`).value = { formula: `SUM(I12:I${rabRow - 1})/2`, result: 0 };
      // Tambahkan persentase TKDN
      wsRAB.getCell(`J${rabRow}`).value = { formula: `IFERROR(K${rabRow}/I${rabRow}, 0)`, result: 0 };
      wsRAB.getCell(`K${rabRow}`).value = { formula: `SUM(K12:K${rabRow - 1})/2`, result: 0 };
      wsRAB.getRow(rabRow).font = { bold: true };
      wsRAB.getCell(`I${rabRow}`).numFmt = '#,##0.00';
      wsRAB.getCell(`J${rabRow}`).numFmt = '0.00%'; // Format TKDN
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
  // 4. Process REKAP RAB
  // ==========================================
  if (selectedSheets.includes('REKAP')) {
    const wsRekap = workbook.worksheets.find(s => s.name.toLowerCase() === 'rekap rab' || s.name.toLowerCase() === 'rekap');
    if (wsRekap) {
      clearDataRows(wsRekap, 12, 1000); // Bersihkan area data

      // Metadata Header
      wsRekap.getCell('E4').value = (project?.nama_program || project?.program || '-').toUpperCase();
      wsRekap.getCell('E5').value = (project?.nama_kegiatan || project?.kegiatan || '-').toUpperCase();
      wsRekap.getCell('E6').value = (project?.nama_sub_kegiatan || project?.sub_kegiatan || '-').toUpperCase();
      wsRekap.getCell('E7').value = (project?.work_name || project?.name || '-').toUpperCase();
      wsRekap.getCell('E8').value = (project?.lokasi || projectLocation || '-').toUpperCase();
      wsRekap.getCell('E9').value = project?.tahun_anggaran || project?.fiscal_year || '2026';

      let rekapRow = 12;

      // Grouping Bab (Sama seperti RAB)
      const groupedRekap = {};
      enrichedLines.forEach(line => {
        const bab = line.bab_pekerjaan || 'I. PEKERJAAN PERSIAPAN';
        if (!groupedRekap[bab]) groupedRekap[bab] = [];
        groupedRekap[bab].push(line);
      });

      let indexAlfabet = 0;
      Object.keys(groupedRekap).forEach((babTitle) => {
        // Kolom NO (A, B, C...)
        wsRekap.getCell(`B${rekapRow}`).value = String.fromCharCode(65 + indexAlfabet);
        wsRekap.getCell(`C${rekapRow}`).value = (babTitle || '-').toUpperCase();

        // VLOOKUP dari sheet 'rab'
        // C:K -> C=1, D=2, E=3, F=4, G=5, H=6, I(Jumlah)=7, J(TKDN %)=8, K(Jumlah TKDN)=9
        if (!selectedSheets.includes('RAB')) {
          const babLines = groupedRekap[babTitle] || [];
          const babSubtotal = babLines.reduce((s, l) => s + (Number(l.volume || 0) * Number(l.harga_satuan || 0)), 0);
          const babTkdn = babLines.reduce((s, l) => s + (Number(l.volume || 0) * Number(l.harga_satuan || 0) * (Number(l.tkdn || 100) / 100)), 0);
          const babTkdnPercent = babSubtotal > 0 ? babTkdn / babSubtotal : 1;

          wsRekap.getCell(`F${rekapRow}`).value = babSubtotal;
          wsRekap.getCell(`G${rekapRow}`).value = babTkdnPercent;
          wsRekap.getCell(`H${rekapRow}`).value = babTkdn;
        } else {
          wsRekap.getCell(`F${rekapRow}`).value = {
            formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 7, FALSE), 0)`
          };
          wsRekap.getCell(`G${rekapRow}`).value = {
            formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 8, FALSE), 0)`
          };
          wsRekap.getCell(`H${rekapRow}`).value = {
            formula: `IFERROR(VLOOKUP("SUB TOTAL "&$C${rekapRow}, 'rab'!C:K, 9, FALSE), 0)`
          };
        }

        wsRekap.getCell(`F${rekapRow}`).numFmt = '#,##0.00';
        wsRekap.getCell(`G${rekapRow}`).numFmt = '0.00%';
        wsRekap.getCell(`H${rekapRow}`).numFmt = '#,##0.00';
        wsRekap.getRow(rekapRow).font = { bold: true };

        // Border untuk item rekap (B sampai H)
        ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
          const cell = wsRekap.getCell(`${col}${rekapRow}`);
          if (col === 'C' || col === 'D' || col === 'E') {
            // Hilangkan border vertikal di tengah C, D, E
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
          } else {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          }
        });

        rekapRow++;
        indexAlfabet++;
      });

      const endDataRow = rekapRow - 1;

      // Beri jarak 1 baris
      const spacerRowRekap = rekapRow;
      wsRekap.getRow(spacerRowRekap).height = 5;
      wsRekap.getCell(`B${spacerRowRekap}`).border = { left: { style: 'thin' } };
      wsRekap.getCell(`H${spacerRowRekap}`).border = { right: { style: 'thin' } };
      rekapRow++;

      // -------------------------------------
      // BAGIAN TOTAL & PPN
      // -------------------------------------
      const totalRow = rekapRow;
      wsRekap.getCell(`C${totalRow}`).value = 'Jumlah Harga Pekerjaan ( termasuk Biaya Umum dan Keuntungan )';
      wsRekap.getCell(`F${totalRow}`).value = { formula: `SUM(F12:F${endDataRow})` };

      const ppnRow = rekapRow + 1;
      const displayPPN = Number(ppnPercent) === 0 ? "0%" : `${ppnPercent}%`;
      wsRekap.getCell(`C${ppnRow}`).value = `( Pajak Pertambahan Nilai ( PPN ) = ${displayPPN} )`;
      wsRekap.getCell(`F${ppnRow}`).value = { formula: `F${totalRow}*${ppnPercent / 100}` };

      const grandTotalRow = rekapRow + 2;
      wsRekap.getCell(`C${grandTotalRow}`).value = 'JUMLAH TOTAL HARGA PEKERJAAN';
      wsRekap.getCell(`F${grandTotalRow}`).value = { formula: `F${totalRow}+F${ppnRow}` };

      // Formatting & Border Bagian Total
      for (let r = totalRow; r <= grandTotalRow; r++) {
        wsRekap.getCell(`F${r}`).numFmt = '#,##0.00';
        wsRekap.getRow(r).font = { bold: true };
        wsRekap.getCell(`C${r}`).alignment = { horizontal: 'left' };

        // Box border dari B sampai H untuk total (C, D, E tanpa border vertikal tengah)
        ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
          const cell = wsRekap.getCell(`${col}${r}`);
          if (col === 'C' || col === 'D' || col === 'E') {
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
          } else {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          }
        });
      }

      // -------------------------------------
      // BAGIAN TANDA TANGAN (SIGNATURES)
      // -------------------------------------
      let sigRow = grandTotalRow + 4;
      wsRekap.getCell(`F${sigRow}`).value = `Kotamobagu,    ${new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`;

      sigRow += 3;
      wsRekap.getCell(`C${sigRow}`).value = 'Diperiksa :';
      wsRekap.getCell(`C${sigRow + 1}`).value = 'FUNGSIONAL TEKNIK PENYEHATAN LINGKUNGAN';
      wsRekap.getCell(`F${sigRow}`).value = 'Disusun Oleh :';
      wsRekap.getCell(`F${sigRow + 1}`).value = 'PELAKSANA BIDANG CIPTA KARYA';

      sigRow += 6;
      wsRekap.getCell(`C${sigRow}`).value = '( NAMA PEJABAT )';
      wsRekap.getCell(`C${sigRow + 1}`).value = 'Nip. ...........................';
      wsRekap.getCell(`F${sigRow}`).value = '( NAMA PENYUSUN )';
      wsRekap.getCell(`F${sigRow + 1}`).value = 'Nip. ...........................';

      // Print Setup A sampai I
      setupPrinter(wsRekap, companyName, `A1:I${sigRow + 3}`, paperSize, 'portrait');

      // Inject Logo (col 0 = A, col 9 = batas kanan I)
      if (headerImageId !== null) {
        wsRekap.addImage(headerImageId, { tl: { col: 0, row: 0 }, br: { col: 9, row: 1 }, editAs: 'twoCell' });
      }
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
    'REKAP': ['REKAP', 'rekap', 'Rekapitulasi', 'rekap rab'],
    'schedule': ['schedule', 'SCHEDULE', 'Kurva-S']
  };

  // ==========================================
  // 5. Process Schedule (Kurva-S Matrix)
  // ==========================================
  if (selectedSheets.some(s => s.toLowerCase() === 'schedule') && Array.isArray(options.scheduleData) && options.scheduleData.length > 0) {
    const wsSched = workbook.getWorksheet('schedule') || workbook.getWorksheet('SCHEDULE') || workbook.getWorksheet('Kurva-S');
    if (wsSched) {
      // 0. Bersihkan Data (Proteksi B5:F7)
      // Bersihkan data item dari baris 8 ke bawah
      clearDataRows(wsSched, 8, 500);

      // Bersihkan hanya header dinamis (Kolom G ke kanan, baris 5-7)
      for (let r = 5; r <= 7; r++) {
        for (let c = 7; c <= 50; c++) { // Bersihkan sampai kolom AX
          const cell = wsSched.getRow(r).getCell(c);
          cell.value = null;
          cell.style = {};
        }
      }

      // 1. Kalkulasi Rentang Waktu Global
      let minDate = new Date("2099-01-01");
      let maxDate = new Date("2000-01-01");
      options.scheduleData.forEach(item => {
        if (item.seq_start) minDate = new Date(Math.min(minDate, new Date(item.seq_start)));
        if (item.seq_end) maxDate = new Date(Math.max(maxDate, new Date(item.seq_end)));
      });
      if (minDate > maxDate) { minDate = new Date(); maxDate = new Date(); maxDate.setDate(minDate.getDate() + 30); }

      minDate.setHours(0, 0, 0, 0);
      maxDate.setHours(23, 59, 59, 999);

      const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
      let totalWeeks = Math.ceil(totalDays / 7);
      if (totalWeeks < 1) totalWeeks = 1;

      // Set B3: Nama Proyek & Total Waktu
      wsSched.getCell('B3').value = `PEKERJAAN: ${project.work_name || project.name} (DURASI: ${totalWeeks} MINGGU / ${totalDays} HARI)`;
      wsSched.getCell('B3').font = { bold: true };

      const startCol = 7; // Kolom G
      const endCol = startCol + totalWeeks - 1;

      // 2. Tulis Header Waktu Dinamis (Baris 5, 6, 7)
      wsSched.mergeCells(5, startCol, 5, endCol);
      wsSched.getCell(5, startCol).value = "WAKTU PELAKSANAAN";
      wsSched.getCell(5, startCol).font = { bold: true };
      wsSched.getCell(5, startCol).alignment = { horizontal: 'center', vertical: 'middle' };

      let currentMonth = -1;
      let monthStartCol = startCol;
      let iterDate = new Date(minDate);
      const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

      for (let w = 0; w < totalWeeks; w++) {
        const col = startCol + w;
        const thisMonth = iterDate.getMonth();

        if (currentMonth === -1) currentMonth = thisMonth;

        // Jika ganti bulan, lakukan merge untuk bulan sebelumnya
        if (thisMonth !== currentMonth) {
          if (monthStartCol < col) {
            wsSched.mergeCells(6, monthStartCol, 6, col - 1);
            wsSched.getCell(6, monthStartCol).value = monthNames[currentMonth];
            wsSched.getCell(6, monthStartCol).alignment = { horizontal: 'center', vertical: 'middle' };
            wsSched.getCell(6, monthStartCol).font = { bold: true };
          }
          currentMonth = thisMonth;
          monthStartCol = col;
        }

        // Hitung Minggu Kalender (M1, M2, M3, M4, M5)
        const calendarWeek = Math.ceil(iterDate.getDate() / 7);

        // Baris 7: M1, M2, M3, M4...
        wsSched.getCell(7, col).value = `M${calendarWeek}`;
        wsSched.getCell(7, col).alignment = { horizontal: 'center' };

        // Jika ini minggu terakhir, merge sisa bulan ini
        if (w === totalWeeks - 1) {
          if (monthStartCol <= col) {
            wsSched.mergeCells(6, monthStartCol, 6, col);
            wsSched.getCell(6, monthStartCol).value = monthNames[currentMonth];
            wsSched.getCell(6, monthStartCol).alignment = { horizontal: 'center', vertical: 'middle' };
            wsSched.getCell(6, monthStartCol).font = { bold: true };
          }
        }

        iterDate.setDate(iterDate.getDate() + 7);
      }

      // Header KET di ujung
      const ketCol = endCol + 1;
      wsSched.getCell(5, ketCol).value = "KET";
      wsSched.mergeCells(5, ketCol, 7, ketCol);
      wsSched.getCell(5, ketCol).alignment = { horizontal: 'center', vertical: 'middle' };

      // 3. Tulis Data Baris Item (Mulai Baris 8)
      const groupedSched = {};
      options.scheduleData.forEach(item => {
        const bab = item.bab || 'I. PEKERJAAN PERSIAPAN';
        if (!groupedSched[bab]) groupedSched[bab] = [];
        groupedSched[bab].push(item);
      });

      let currentRow = 8;
      let globalIdx = 0;

      // Calculate final summary row (tRow) upfront for accurate formula references
      const totalBabs = Object.keys(groupedSched).length;
      const totalItems = options.scheduleData.length;
      const tRow = 8 + totalBabs + totalItems + 1; // +1 for the 5px spacer row

      // Calculate total project subtotal for Bobot denominator to match app logic
      const projectSubtotal = Array.isArray(ahspLines)
        ? ahspLines.reduce((acc, l) => acc + (Number(l.volume || 0) * Number(l.harga_satuan || 0)), 0)
        : (options.scheduleData.reduce((acc, it) => acc + (Number(it.volume || 0) * Number(it.harga_satuan || it.total_subtotal || 0)), 0) || 1);

      Object.entries(groupedSched).forEach(([babTitle, items], bIdx) => {
        // Baris Header BAB
        wsSched.getCell(`B${currentRow}`).value = romanize(bIdx + 1);
        wsSched.getCell(`C${currentRow}`).value = (babTitle || '-').toUpperCase();
        wsSched.getRow(currentRow).font = { bold: true };
        // Fill abu-abu hanya dari kolom B sampai KET (agar tidak meluber keluar tabel)
        for (let i = 2; i <= ketCol; i++) {
          wsSched.getCell(currentRow, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        }
        currentRow++;

        items.forEach((item) => {
          globalIdx++;
          wsSched.getCell(`B${currentRow}`).value = globalIdx;
          wsSched.getCell(`C${currentRow}`).value = item.uraian;

          // D: Harga (Total Harga Item = Volume * Unit Price)
          const itemTotalVal = Number(item.volume || 0) * Number(item.harga_satuan || item.total_subtotal || 0);
          const itemBobotVal = projectSubtotal > 0 ? (itemTotalVal / projectSubtotal) : 0;

          if (isStandalone) {
            wsSched.getCell(`D${currentRow}`).value = itemTotalVal;
            wsSched.getCell(`E${currentRow}`).value = itemBobotVal;
          } else {
            wsSched.getCell(`D${currentRow}`).value = {
              formula: `IFERROR(VLOOKUP(C${currentRow}, 'rab'!C:K, 7, FALSE), 0)`,
              result: itemTotalVal
            };
            wsSched.getCell(`E${currentRow}`).value = {
              formula: `IFERROR(D${currentRow}/D${tRow}, 0)`,
              result: itemBobotVal
            };
          }
          wsSched.getCell(`D${currentRow}`).numFmt = '#,##0.00';
          wsSched.getCell(`E${currentRow}`).numFmt = '0.00%';

          // Distribusi Bobot
          let itemStart = new Date(item.seq_start || minDate);
          let itemEnd = new Date(item.seq_end || itemStart);
          itemStart.setHours(0, 0, 0, 0);
          itemEnd.setHours(23, 59, 59, 999);
          if (itemEnd < itemStart) itemEnd = new Date(itemStart);

          const diffStartDays = Math.floor((itemStart - minDate) / (1000 * 60 * 60 * 24));
          const startW = Math.max(0, Math.floor(diffStartDays / 7));
          const diffEndDays = Math.floor((itemEnd - minDate) / (1000 * 60 * 60 * 24));
          const endW = Math.max(startW, Math.floor(diffEndDays / 7));
          const itemWeeksSpanned = endW - startW + 1;

          for (let w = 0; w < itemWeeksSpanned; w++) {
            const targetCol = startCol + startW + w;
            if (targetCol <= endCol) {
              wsSched.getCell(currentRow, targetCol).value = { formula: `IFERROR($E$${currentRow}/${itemWeeksSpanned}, 0)` };
              wsSched.getCell(currentRow, targetCol).numFmt = '0.00%';
            }
          }
          currentRow++;
        });
      });

      // 4. Baris Spasi Sebelum Total (Data ke Total)
      const spacerRowBeforeTotal = currentRow;
      wsSched.getRow(spacerRowBeforeTotal).height = 5;
      wsSched.getCell(spacerRowBeforeTotal, 2).border = { left: { style: 'thin' } };
      wsSched.getCell(spacerRowBeforeTotal, ketCol).border = { right: { style: 'thin' } };
      currentRow++;

      // 5. Baris Summary Bawah
      // tRow sudah dihitung di awal
      wsSched.mergeCells(`B${tRow}:C${tRow}`);
      wsSched.getCell(`B${tRow}`).value = "JUMLAH";
      wsSched.getCell(`B${tRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      wsSched.getRow(tRow).font = { bold: true };

      if (isStandalone) {
        wsSched.getCell(`D${tRow}`).value = projectSubtotal;
        wsSched.getCell(`E${tRow}`).value = 1; // 100%
      } else {
        wsSched.getCell(`D${tRow}`).value = { formula: `SUM(D8:D${tRow - 1})`, result: projectSubtotal };
        wsSched.getCell(`E${tRow}`).value = { formula: `SUM(E8:E${tRow - 1})`, result: 1 };
      }

      wsSched.getCell(`D${tRow}`).numFmt = '#,##0.00';
      wsSched.getCell(`E${tRow}`).numFmt = '0.00%';

      const rPM = tRow + 2; // RENCANA PROGRESS MINGGUAN
      const kPM = tRow + 3; // KUMULATIF PROGRESS MINGGUAN
      const aPM = tRow + 4; // AKTUAL PROGRESS MINGGUAN
      const kA = tRow + 5; // KUMULATIF PROGRESS AKTUAL
      const dev = tRow + 6; // DEVIASI

      [rPM, kPM, aPM, kA, dev].forEach(r => {
        wsSched.mergeCells(`B${r}:E${r}`);
        wsSched.getCell(`B${r}`).alignment = { horizontal: 'right' };
        wsSched.getRow(r).font = { bold: true };
      });

      wsSched.getCell(`B${rPM}`).value = "RENCANA PROGRESS MINGGUAN";
      wsSched.getCell(`B${kPM}`).value = "KUMULATIF PROGRESS MINGGUAN";
      wsSched.getCell(`B${aPM}`).value = "AKTUAL PROGRESS MINGGUAN";
      wsSched.getCell(`B${kA}`).value = "KUMULATIF PROGRESS AKTUAL";
      wsSched.getCell(`B${dev}`).value = "DEVIASI";

      // Kalkulasi Progress Aktual per Minggu jika ada data
      const weeklyActualMap = {};
      if (Array.isArray(options.progressData) && options.progressData.length > 0) {
        const totalProjectPrice = options.scheduleData.reduce((sum, it) => sum + (Number(it.volume || 0) * Number(it.harga_satuan || it.total_subtotal || 0)), 0);

        options.progressData.forEach(p => {
          const weekIdx = Math.floor(Number(p.day_number) / 7);
          const item = options.scheduleData.find(it => it.id === p.entity_id);
          if (item && totalProjectPrice > 0) {
            const itemPrice = Number(item.harga_satuan || item.total_subtotal || 0);
            const valMoney = Number(p.val || 0) * itemPrice;
            const valPercent = valMoney / totalProjectPrice;
            weeklyActualMap[weekIdx] = (weeklyActualMap[weekIdx] || 0) + valPercent;
          }
        });
      }

      // Rumus Horizontal untuk Summary
      for (let c = startCol; c <= endCol; c++) {
        const colIdx = c - startCol; // 0, 1, 2...
        const colLetter = wsSched.getColumn(c).letter;
        const prevColLetter = wsSched.getColumn(c - 1).letter;

        wsSched.getCell(`${colLetter}${rPM}`).value = { formula: `SUM(${colLetter}8:${colLetter}${tRow - 1})` };
        wsSched.getCell(`${colLetter}${rPM}`).numFmt = '0.00%';

        if (c === startCol) wsSched.getCell(`${colLetter}${kPM}`).value = { formula: `${colLetter}${rPM}` };
        else wsSched.getCell(`${colLetter}${kPM}`).value = { formula: `${prevColLetter}${kPM}+${colLetter}${rPM}` };
        wsSched.getCell(`${colLetter}${kPM}`).numFmt = '0.00%';

        // AKTUAL PROGRESS MINGGUAN (Dari Database jika ada)
        const actualVal = weeklyActualMap[colIdx] || 0;
        wsSched.getCell(`${colLetter}${aPM}`).value = actualVal > 0 ? actualVal : "";
        wsSched.getCell(`${colLetter}${aPM}`).numFmt = '0.00%';

        if (c === startCol) wsSched.getCell(`${colLetter}${kA}`).value = { formula: `IF(${colLetter}${aPM}="","",${colLetter}${aPM})` };
        else wsSched.getCell(`${colLetter}${kA}`).value = { formula: `IF(${colLetter}${aPM}="","",${prevColLetter}${kA}+${colLetter}${aPM})` };
        wsSched.getCell(`${colLetter}${kA}`).numFmt = '0.00%';

        wsSched.getCell(`${colLetter}${dev}`).value = { formula: `IF(${colLetter}${kA}="","",${colLetter}${kA}-${colLetter}${kPM})` };
        wsSched.getCell(`${colLetter}${dev}`).numFmt = '0.00%';
      }

      // 5. Gambar Garis Tabel (Border)
      const lastDataRow = dev;
      const lastDataCol = ketCol;

      for (let r = 5; r <= lastDataRow; r++) {
        if (r === tRow - 1 || r === tRow + 1) {
          // Baris spasi: set tinggi 5 dan beri border kiri-kanan saja agar tidak melayang
          wsSched.getRow(r).height = 5;
          wsSched.getCell(r, 2).border = { left: { style: 'thin' } };
          wsSched.getCell(r, lastDataCol).border = { right: { style: 'thin' } };
          continue;
        }
        for (let c = 2; c <= lastDataCol; c++) {
          const cell = wsSched.getRow(r).getCell(c);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
      }

      // Terakhir: Setup Printer
      const pArea = `A1:${wsSched.getColumn(endCol + 1).letter}${dev + 2}`;
      setupPrinter(wsSched, companyName, pArea, paperSize, 'landscape');
      if (headerImageId !== null) {
        wsSched.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      }
    }
  }

  const selectedSheetNames = selectedSheets.flatMap(s => sheetMap[s] || [s]);

  // Create a copy of worksheets array to avoid index shifting issues while removing
  const worksheets = [...workbook.worksheets];

  worksheets.forEach(ws => {
    const isSelected = selectedSheetNames.some(name => ws.name.toLowerCase() === name.toLowerCase());

    if (!isSelected) {
      ws.state = 'veryHidden';
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
    
    // Proteksi: Sheet 'cover' adalah statis, jangan sembunyikan meski 'hasData' false
    if (ws.name.toLowerCase() === 'cover') {
      hasData = true;
      highestRowWithData = 43;
    }

    if (!hasData) {
      // Jika kosong (tidak ada data), sembunyikan saja (veryHidden) agar tidak merusak formula cross-sheet
      ws.state = 'veryHidden';
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
      } else if (name.includes('rekap') || name === 'cover') {
        lastCol = 'I';
      }

      const pArea = `A1:${lastCol}${lastRow}`;

      let orient = 'portrait';
      const lowName = ws.name.toLowerCase();
      if (lowName.includes('schedule') || lowName.includes('kurva-s')) {
        orient = 'landscape';
      }

      setupPrinter(ws, companyName, pArea, paperSize, orient);
    }
  });

  // --- PROTEKSI ANTI-CORRUPT: Pastikan ada minimal 1 sheet ---
  if (workbook.worksheets.length === 0) {
    const fallbackSheet = workbook.addWorksheet('Data Kosong');
    fallbackSheet.getCell('A1').value = 'Data RAB kosong atau filter sheet menghapus semua data.';
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // --- SANITASI NAMA FILE ---
  const safeName = (options.fileName || project?.name || project?.work_name || 'Export')
    .replace('.xlsx', '')
    .replace(/[^a-zA-Z0-9 \-_]/g, '')
    .trim();
  a.download = `${safeName}.xlsx`;
  document.body.appendChild(a);

  a.click();

  // --- FIX: Jeda agar browser sempat membaca metadata ---
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
};

export { generateProjectReport };