const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/dashboard/new-project/page.js');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Add ThemeToggle import
code = code.replace(
  "import * as XLSX from 'xlsx';",
  "import * as XLSX from 'xlsx';\nimport { ThemeToggle } from '@/components/ThemeToggle';"
);

// 2. Add uraianCustom to createEmptyRow
code = code.replace(
  "uraian: '',",
  "uraian: '',\n    uraianCustom: '',"
);

// 3. Fix Upah: Rp 0 display
code = code.replace(
  "[Upah: {formatIdr(row.detailData.upah)} | Bhn: {formatIdr(row.detailData.bahan)} | Alt: {formatIdr(row.detailData.alat)}]",
  "[Upah: {formatIdr(row.detailData.upah || 0)} | Bhn: {formatIdr(row.detailData.bahan || 0)} | Alt: {formatIdr(row.detailData.alat || 0)}]"
);

// 4. Update Header in page
code = code.replace(
  "</div>\n          <div className=\"flex items-center gap-3\">",
  "</div>\n          <div className=\"flex items-center gap-3\">\n            <ThemeToggle />"
);

// 5. Update Table Headers
const oldThead = `<th className="px-3 py-2 w-10 text-center">No</th>
                      <th className="px-3 py-2 w-96">Uraian / Analisa Pekerjaan</th>
                      <th className="px-3 py-2 w-20">Satuan</th>
                      <th className="px-3 py-2 w-16 text-right">Prof(%)</th>
                      <th className="px-3 py-2 w-24 text-right">Volume</th>
                      <th className="px-3 py-2 w-32 text-right">Harga Sat.</th>
                      <th className="px-3 py-2 w-36 text-right">Jumlah (Rp)</th>
                      <th className="px-3 py-2 w-10"></th>`;
const newThead = `<th className="px-3 py-2 w-10 text-center dark:border-slate-700">No</th>
                      <th className="px-3 py-2 w-80 dark:border-slate-700">Uraian / Analisa Pekerjaan</th>
                      <th className="px-3 py-2 w-48 dark:border-slate-700">Nama Uraian Custom</th>
                      <th className="px-3 py-2 w-20 dark:border-slate-700">Satuan</th>
                      <th className="px-3 py-2 w-16 text-right dark:border-slate-700">Prof(%)</th>
                      <th className="px-3 py-2 w-24 text-right dark:border-slate-700">Volume</th>
                      <th className="px-3 py-2 w-32 text-right dark:border-slate-700">Harga Sat.</th>
                      <th className="px-3 py-2 w-36 text-right dark:border-slate-700">Jumlah (Rp)</th>
                      <th className="px-3 py-2 w-10 dark:border-slate-700"></th>`;
code = code.replace(oldThead, newThead);

// 6. Update colSpan in tfoot
code = code.replace('colSpan="8"', 'colSpan="9"');
code = code.replace('colSpan="6"', 'colSpan="7"');

// 7. Inject TD for custom name
const tdUraianCustom = `
                          <td className="px-3 py-2">
                            <input
                              value={row.uraianCustom}
                              onChange={(e) => updateRowInSection(sec.id, row.key, { uraianCustom: e.target.value })}
                              className="w-full border-0 bg-transparent px-1 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50 rounded dark:text-slate-200"
                              placeholder="Ketik manual..."
                            />
                          </td>`;
code = code.replace(
  '// Store to show upah/bahan/alat\n    });\n  }\n',
  '// Store to show upah/bahan/alat\n    });\n  }\n'
);
// let's do regex for the td injection
const tdSatuanRegex = /(<td className="px-3 py-2">\s*<input\s*value={row.satuan})/g;
// just replace the first match of row.satuan logic internally? Actually there are multiple td's.
code = code.replace(
  /<td className="px-3 py-2">\s*<input\s*value={row\.satuan}/,
  tdUraianCustom.trim() + '\n                          <td className="px-3 py-2">\n                            <input\n                              value={row.satuan}'
);

// 8. Update handleSubmit
code = code.replace(
  "uraian: r.uraian,",
  "uraian: r.uraian,\n            uraian_custom: r.uraianCustom || null,"
);

// 9. Update Export Excel
code = code.replace(
  "rabData.push(['NO', 'URAIAN PEKERJAAN', 'SATUAN', 'VOLUME', 'HARGA SATUAN (Rp)', 'JUMLAH HARGA (Rp)']);",
  "rabData.push(['NO', 'URAIAN PEKERJAAN', 'NAMA CUSTOM', 'SATUAN', 'VOLUME', 'HARGA SATUAN (Rp)', 'JUMLAH HARGA (Rp)']);"
);
code = code.replace(
  "rabData.push([ (idx + 1).toString(), r.uraian, r.satuan, vol, hs || 0, vol * hs || 0 ]);",
  "rabData.push([ (idx + 1).toString(), r.uraian, r.uraianCustom || '', r.satuan, vol, hs || 0, vol * hs || 0 ]);"
);

// 10. Dark Mode theme classes modifications (rough bulk replace)
// Backgrounds
code = code.replace(/bg-slate-50\/50/g, 'bg-slate-50/50 dark:bg-[#0f172a]');
code = code.replace(/bg-slate-50(?![\/\-])/g, 'bg-slate-50 dark:bg-[#0f172a]');
code = code.replace(/bg-white/g, 'bg-white dark:bg-[#1e293b]');
code = code.replace(/bg-slate-900/g, 'bg-slate-900 dark:bg-[#020617]');
code = code.replace(/bg-indigo-50(?![\/\-])/g, 'bg-indigo-50 dark:bg-indigo-900/40');
code = code.replace(/bg-indigo-50\/50/g, 'bg-indigo-50/50 dark:bg-indigo-900/20');
code = code.replace(/hover:bg-indigo-50\/30/g, 'hover:bg-indigo-50/30 dark:hover:bg-indigo-900/30');

// Text colors
code = code.replace(/text-slate-900/g, 'text-slate-900 dark:text-slate-100');
code = code.replace(/text-slate-800/g, 'text-slate-800 dark:text-slate-200');
code = code.replace(/text-slate-700/g, 'text-slate-700 dark:text-slate-300');
code = code.replace(/text-slate-600/g, 'text-slate-600 dark:text-slate-400');
code = code.replace(/text-slate-500/g, 'text-slate-500 dark:text-slate-400');
code = code.replace(/text-indigo-900/g, 'text-indigo-900 dark:text-amber-400'); // Oranges/yellows
code = code.replace(/text-indigo-700/g, 'text-indigo-700 dark:text-amber-500');
code = code.replace(/text-indigo-600/g, 'text-indigo-600 dark:text-amber-500');
code = code.replace(/text-indigo-800/g, 'text-indigo-800 dark:text-amber-300');

// Borders
code = code.replace(/border-slate-200/g, 'border-slate-200 dark:border-slate-700');
code = code.replace(/border-slate-300/g, 'border-slate-300 dark:border-slate-600');
code = code.replace(/border-indigo-300/g, 'border-indigo-300 dark:border-amber-500/50');
code = code.replace(/border-indigo-200/g, 'border-indigo-200 dark:border-amber-500/30');
code = code.replace(/border-slate-800/g, 'border-slate-800 dark:border-[#1e293b]');

// Button Backgrounds
code = code.replace(/bg-indigo-600/g, 'bg-indigo-600 dark:bg-amber-600');
code = code.replace(/hover:bg-indigo-700/g, 'hover:bg-indigo-700 dark:hover:bg-amber-700');

fs.writeFileSync(filePath, code);
console.log('Successfully patched new-project/page.js!');
