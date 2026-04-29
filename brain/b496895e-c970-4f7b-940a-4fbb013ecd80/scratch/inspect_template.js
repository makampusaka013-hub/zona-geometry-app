const ExcelJS = require('exceljs');
const path = require('path');

async function inspectTemplate() {
    const workbook = new ExcelJS.Workbook();
    const filePath = path.join('d:', 'data', 'Aplikasi', 'Zona Geometry-App', 'public', 'templates', 'master_template_custom.xlsx');
    
    try {
        await workbook.xlsx.readFile(filePath);
        console.log('--- Workbook Loaded ---');
        console.log('Worksheets:', workbook.worksheets.map(ws => ws.name));

        const targets = ['harian', 'mingguan', 'bulanan', 'database'];
        
        targets.forEach(name => {
            const ws = workbook.worksheets.find(s => s.name.toLowerCase() === name.toLowerCase());
            if (!ws) {
                console.log(`\n[Sheet: ${name}] - NOT FOUND`);
                return;
            }
            console.log(`\n[Sheet: ${ws.name}]`);
            
            // Check top 20 rows for structure
            for (let i = 1; i <= 20; i++) {
                const row = ws.getRow(i);
                const values = row.values.slice(1); // ExcelJS values are 1-indexed
                if (values.length > 0) {
                    const rowSummary = values.map((v, idx) => {
                        if (v && typeof v === 'object' && v.formula) {
                            return `[F: ${v.formula}]`;
                        }
                        return v === null ? '' : v;
                    }).join(' | ');
                    console.log(`Row ${i}: ${rowSummary}`);
                }
            }
        });

    } catch (error) {
        console.error('Error reading template:', error);
    }
}

inspectTemplate();
