const ExcelJS = require('exceljs');
const path = require('path');

async function inspectTemplate() {
    const workbook = new ExcelJS.Workbook();
    const templatePath = path.join('d:/data/Aplikasi/Zona Geometry-App/public/templates/master_template_custom.xlsx');
    await workbook.xlsx.readFile(templatePath);

    const sheets = ['harga satuan', 'ahsp'];
    sheets.forEach(name => {
        const ws = workbook.getWorksheet(name);
        if (!ws) {
            console.log(`Sheet "${name}" not found!`);
            return;
        }
        console.log(`\n--- Inspecting Sheet: ${name} ---`);
        const headerRow = ws.getRow(5); // Assuming headers are on row 5
        headerRow.eachCell((cell, colNumber) => {
            console.log(`Col ${colNumber} (${String.fromCharCode(64 + colNumber)}): "${cell.value}"`);
        });
    });
}

inspectTemplate();
