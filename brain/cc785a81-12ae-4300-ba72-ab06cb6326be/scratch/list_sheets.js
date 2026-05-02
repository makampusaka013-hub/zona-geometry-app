const ExcelJS = require('exceljs');
const path = require('path');

async function listSheets() {
    const workbook = new ExcelJS.Workbook();
    const templatePath = path.join('d:/data/Aplikasi/Zona Geometry-App/public/templates/master_template_custom.xlsx');
    await workbook.xlsx.readFile(templatePath);
    console.log('Sheets in workbook:', workbook.worksheets.map(ws => ws.name));
}

listSheets();
