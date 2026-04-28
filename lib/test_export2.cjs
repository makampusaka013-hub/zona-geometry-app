const fs = require('fs');

async function test() {
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

  const project = { name: 'Test', ppn_percent: 11 };
  const userMember = { role: 'normal' };
  
  const enrichedLines = [
    {
      kode_item: 'A1', uraian: 'Pekerjaan A', volume: 10, harga_satuan: 1000, total_subtotal: 10000, bab: 'I',
      master_ahsp: {
        kode_ahsp: 'M1',
        details: [
          { kode_item: 'B1', uraian: 'Material X', koefisien: 1, harga_satuan: 500, tkdn: 10, jenis_komponen: 'bahan' },
          { kode_item: 'T1', uraian: 'Pekerja', koefisien: 2, harga_satuan: 200, tkdn: 0, jenis_komponen: 'upah' }
        ]
      }
    }
  ];

  const origBuffer = ExcelJS.default.Workbook.prototype.xlsx.writeBuffer;
  ExcelJS.default.Workbook.prototype.xlsx.writeBuffer = async function() {
    const buffer = await origBuffer.call(this);
    fs.writeFileSync('test_output2.xlsx', Buffer.from(buffer));
    console.log("File saved to test_output2.xlsx");
    return buffer;
  };

  try {
    await generateProjectReportStatic(project, userMember, enrichedLines, ['HARGA SATUAN'], {});
    console.log("Export complete.");
  } catch (e) { console.error("Export error:", e); }
}

test();
