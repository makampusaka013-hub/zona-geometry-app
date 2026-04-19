import * as XLSX from 'xlsx';

/**
 * Utility to format Indonesian Rupiah
 */
export function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(n || 0);
}

/**
 * Utility to format numbers
 */
export function fmt(n) { 
  return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }); 
}

/**
 * Convert number to Roman numeral (for BAB labels)
 */
export function romanize(num) {
  if (isNaN(num)) return '';
  const digits = String(+num).split('');
  const key = [
    '','C','CC','CCC','CD','D','DC','DCC','DCCC','CM',
    '','X','XX','XXX','XL','L','LX','LXX','LXXX','XC',
    '','I','II','III','IV','V','VI','VII','VIII','IX'
  ];
  let roman = '';
  let i = 3;
  while (i--) roman = (key[+digits.pop() + (i * 10)] || '') + roman;
  return Array(+digits.join('') + 1).join('M') + roman;
}

/**
 * Aggregate daily progress data into a specific period (Daily, Weekly, Monthly)
 */
export function aggregateProgress(dailyData, type, startDate, endDate) {
  // dailyData format: { [entity_key]: { [day_number]: value } }
  // Returns: { [entity_key]: { periodTotal: sum, prevTotal: sum, cumulativeTotal: sum } }
  
  const result = {};
  const sDate = new Date(startDate);
  const eDate = new Date(endDate);
  
  Object.keys(dailyData).forEach(key => {
    let periodSum = 0;
    let prevSum = 0;
    
    // Day logic depends on projectStartDate
    // Assuming day_number 1 is projectStartDate
    
    Object.entries(dailyData[key]).forEach(([dayStr, val]) => {
      const dayNum = parseInt(dayStr);
      const d = new Date(startDate);
      d.setDate(d.getDate() + (dayNum - 1));
      
      if (d >= sDate && d <= eDate) {
        periodSum += val;
      } else if (d < sDate) {
        prevSum += val;
      }
    });
    
    result[key] = {
      period: periodSum,
      previous: prevSum,
      cumulative: periodSum + prevSum
    };
  });
  
  return result;
}

/**
 * Main Export Function for Laporan Harian/Mingguan/Bulanan
 */
export function exportReportToExcel({ 
  type, // 'harian', 'mingguan', 'bulanan'
  project, 
  items, // ahspLines
  dailyProgress, 
  startDate, 
  endDate,
  manpowerResources // optional for additional info
}) {
  const wb = XLSX.utils.book_new();
  const summaryProgress = aggregateProgress(dailyProgress, type, startDate, endDate);
  
  const data = [];
  
  // 1. Header Section
  const title = type === 'harian' ? 'LAPORAN HARIAN PEKERJAAN' : 
                type === 'mingguan' ? 'LAPORAN MINGGUAN PEKERJAAN' : 'LAPORAN BULANAN PEKERJAAN';
  
  data.push([title]);
  data.push([]);
  data.push(['Program', ':', project.program_name || '-']);
  data.push(['Kegiatan', ':', project.activity_name || '-']);
  data.push(['Pekerjaan', ':', project.work_name || '-']);
  data.push(['Lokasi', ':', project.location || '-']);
  data.push(['Nomor Kontrak', ':', project.contract_number || '-']);
  data.push(['Tahun Anggaran', ':', project.fiscal_year || '-']);
  data.push(['Periode', ':', `${new Date(startDate).toLocaleDateString('id-ID')} s.d ${new Date(endDate).toLocaleDateString('id-ID')}`]);
  data.push([]);

  const colHeaders = [
    'NO', 'URAIAN PEKERJAAN', 'SAT', 'VOL KONTRAK', 'HARGA SATUAN', 'JUMLAH HARGA', 
    'BOBOT %', 'PREV VOL', 'CURR VOL', 'CUM VOL', 'CUM %', 'SISA VOL'
  ];
  data.push(colHeaders);

  // Grouping by Bab
  const sectionsObj = {};
  items.forEach(line => {
    const bab = line.bab_pekerjaan || 'UMUM';
    if (!sectionsObj[bab]) sectionsObj[bab] = { name: bab, lines: [], subtotal: 0 };
    sectionsObj[bab].lines.push(line);
    sectionsObj[bab].subtotal += (line.jumlah || 0);
  });
  const sections = Object.values(sectionsObj).sort((a,b) => a.lines[0]?.sort_order - b.lines[0]?.sort_order);
  const grandTotal = sections.reduce((s, b) => s + b.subtotal, 0);

  let globalRowCounter = 1;
  sections.forEach((sec, sIdx) => {
    data.push([romanize(sIdx+1), sec.name.toUpperCase(), '', '', '', '', '', '', '', '', '', '']);
    
    sec.lines.forEach((line, lIdx) => {
      const prog = summaryProgress[line.id] || { period: 0, previous: 0, cumulative: 0 };
      const weight = (line.jumlah / grandTotal) * 100;
      const cumWeight = (prog.cumulative / line.volume) * weight;

      data.push([
        globalRowCounter++,
        line.uraian,
        line.satuan,
        line.volume,
        line.harga_satuan,
        line.jumlah,
        weight,
        prog.previous,
        prog.period,
        prog.cumulative,
        cumWeight,
        line.volume - prog.cumulative
      ]);
    });
  });

  data.push([]);
  
  // 3. Signature Area
  const signatureStartRow = data.length + 2;
  data.push([]);
  data.push([]);
  data.push(['', 'Disetujui Oleh:', '', 'Diperiksa Oleh:', '', 'Dibuat Oleh:']);
  data.push(['', 'Pejabat Pembuat Komitmen (PPK)', '', 'Konsultan Pengawas', '', 'Kontraktor Pelaksana']);
  data.push([]);
  data.push([]);
  data.push([]);
  data.push([]);
  data.push([
    '', 
    project.ppk_name || '(..........................)', 
    '', 
    project.konsultan_supervisor || '(..........................)', 
    '', 
    project.kontraktor_director || '(..........................)'
  ]);
  data.push([
    '', 
    project.ppk_nip ? `NIP: ${project.ppk_nip}` : 'NIP: ..........................', 
    '', 
    project.konsultan_name || '', 
    '', 
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Basic Column Widths
  ws['!cols'] = [
    { wch: 5 }, { wch: 40 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Laporan");
  
  const filename = `${title}_${project.work_name || project.name}.xlsx`;
  XLSX.writeFile(wb, filename);
}
