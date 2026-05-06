const ExcelJS = require('exceljs');
const path = require('path');

async function analyzeTemplate() {
    const templatePath = 'e:/Zona Geometry-App/public/templates/master_template_custom.xlsx';
    const workbook = new ExcelJS.Workbook();
    
    try {
        await workbook.xlsx.readFile(templatePath);
        console.log('--- ANALISA BORDER TEMPLATE ---');

        const targetSheets = ['harga satuan', 'rab', 'ahsp', 'hsp'];
        
        targetSheets.forEach(name => {
            const ws = workbook.getWorksheet(name) || workbook.worksheets.find(s => s.name.toLowerCase().includes(name));
            if (!ws) {
                console.log(`Sheet "${name}" tidak ditemukan.`);
                return;
            }

            console.log(`\nMemeriksa Sheet: ${ws.name}`);
            
            // Cek baris 100 sebagai sampel baris "jauh" yang seharusnya kosong
            const sampleRow = 100;
            const row = ws.getRow(sampleRow);
            let hasBorder = false;
            
            for (let i = 1; i <= 15; i++) {
                const cell = row.getCell(i);
                if (cell.border && Object.keys(cell.border).length > 0) {
                    hasBorder = true;
                    break;
                }
            }

            if (hasBorder) {
                console.log(`[!] PERINGATAN: Baris ${sampleRow} pada template memiliki border.`);
            } else {
                console.log(`[OK] Baris ${sampleRow} bersih dari border.`);
            }

            // Cari baris terakhir yang punya border
            let lastBorderRow = 0;
            ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                for (let i = 1; i <= 15; i++) {
                    const cell = row.getCell(i);
                    if (cell.border && Object.keys(cell.border).length > 0) {
                        lastBorderRow = Math.max(lastBorderRow, rowNumber);
                        break;
                    }
                }
            });
            console.log(`Baris terakhir yang memiliki border: ${lastBorderRow}`);
        });

    } catch (error) {
        console.error('Gagal membaca file:', error.message);
    }
}

analyzeTemplate();
