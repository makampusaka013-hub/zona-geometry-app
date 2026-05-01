import ExcelJS from 'exceljs';

export const romanize = (num) => {
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

/**
 * 1. Hide sheets instead of removing them to prevent formula corruption
 */
const manageSheetVisibility = (workbook, selectedSheets) => {
  if (!selectedSheets || selectedSheets.length === 0) return;
  
  const normalizedSelected = selectedSheets.map(s => s.toLowerCase().trim());
  
  workbook.worksheets.forEach(ws => {
    const wsName = ws.name.toLowerCase().trim();
    // Check if sheet name is in selected list (case insensitive)
    const isSelected = normalizedSelected.some(sel => wsName.includes(sel));
    
    if (!isSelected) {
      ws.state = 'veryHidden';
    } else {
      ws.state = 'visible';
    }
  });
};

/**
 * 2. Main data injection logic
 */
export async function fillExcelData(workbook, project, user, ahspLines, selectedSheets, options = {}) {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const projectLocation = project.location || project.address || '-';
  const { isCatalog = false, projectPrices = [] } = options;

  // Manage visibility FIRST to ensure formulas stay intact
  manageSheetVisibility(workbook, selectedSheets);

  // Example: Fill COVER sheet
  const wsCover = workbook.getWorksheet('COVER') || workbook.getWorksheet('Cover');
  if (wsCover && wsCover.state === 'visible') {
    wsCover.getCell('D10').value = (project.name || '').toUpperCase();
    wsCover.getCell('D12').value = (projectLocation || '').toUpperCase();
    wsCover.getCell('D14').value = project.fiscal_year || '-';
    wsCover.getCell('D16').value = companyName.toUpperCase();
  }

  // Example: Fill REKAP sheet
  const wsRekap = workbook.getWorksheet('REKAP') || workbook.getWorksheet('Rekapitulasi');
  if (wsRekap && wsRekap.state === 'visible') {
    wsRekap.getCell('C6').value = project.name;
    wsRekap.getCell('C7').value = projectLocation;
  }

  // Example: Fill RAB sheet
  const wsRab = workbook.getWorksheet('RAB') || workbook.getWorksheet('Rab');
  if (wsRab && wsRab.state === 'visible') {
    // Fill headers
    wsRab.getCell('C6').value = project.name;
    wsRab.getCell('C7').value = projectLocation;
    
    // Fill items
    let currentRow = 10;
    ahspLines.forEach((line, idx) => {
      // Pastikan baris memiliki style yang sesuai (copy dari baris 10)
      if (currentRow > 10) {
          const firstRow = wsRab.getRow(10);
          const newRow = wsRab.getRow(currentRow);
          newRow.height = firstRow.height;
          // Note: ExcelJS row copying is basic, for full borders it's better to pre-style in template
      }

      wsRab.getCell(`B${currentRow}`).value = idx + 1;
      wsRab.getCell(`C${currentRow}`).value = line.uraian;
      wsRab.getCell(`D${currentRow}`).value = line.satuan;
      wsRab.getCell(`E${currentRow}`).value = Number(line.volume) || 0;
      wsRab.getCell(`F${currentRow}`).value = Number(line.harga_satuan) || 0;
      wsRab.getCell(`G${currentRow}`).value = { formula: `E${currentRow}*F${currentRow}` };
      currentRow++;
    });
  }

  return workbook;
}
