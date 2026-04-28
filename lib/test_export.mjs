const fs = require('fs');

async function testExport() {
  const { generateProjectReportStatic } = await import('./excel_engine_static.js');
  const ExcelJS = await import('exceljs');
  
  global.window = { URL: { createObjectURL: () => 'dummy', revokeObjectURL: () => {} } };
  global.document = { createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toDataURL: () => 'data:image/png;base64,dummy' }) };
  global.Image = class { set src(v) { setTimeout(() => this.onload(), 10); } };
  
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('master_template_custom.xlsx')) {
      return { arrayBuffer: async () => fs.readFileSync('../public/templates/master_template_custom.xlsx') };
    }
    return originalFetch(url);
  };
  
  const project = { name: 'Test Proyek', ppn_percent: 11 };
  const userMember = { role: 'normal' };
  
  const enrichedLines = [
    {
      kode_item: 'A1', uraian: 'Pekerjaan A', volume: 10, harga_satuan: 1000, total_subtotal: 10000, bab: 'I',
      master_ahsp: {
        details: [
          { kode_item: 'M1', uraian: 'Material 1', koefisien: 1, harga_satuan: 500, tkdn: 10, jenis: 'bahan' }
        ]
      }
    }
  ];
  
  const options = {
    projectPrices: [{ kode_item: 'M1', harga_satuan: 500 }],
    fileName: 'test_output_full',
    scheduleData: [], progressData: []
  };

  const origBuffer = ExcelJS.default.Workbook.prototype.xlsx.writeBuffer;
  ExcelJS.default.Workbook.prototype.xlsx.writeBuffer = async function() {
    const buffer = await origBuffer.call(this);
    fs.writeFileSync('test_output_full.xlsx', Buffer.from(buffer));
    console.log("File saved");
    return buffer;
  };
  
  try {
    await generateProjectReportStatic(project, userMember, enrichedLines, ['HARGA SATUAN'], options);
  } catch (e) { console.error(e); }
}

testExport();
