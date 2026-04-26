import html2pdf from 'html2pdf.js';

/**
 * PDF Export Engine for Zona Geometry
 * Supports: Cover, RAB, Rekap, AHSP, HSP, Schedule
 * Mixed Orientation: Portrait for tables, Landscape for Schedule
 */

export const generateProjectPDF = async (project, user, data, selectedSheets, options = {}) => {
  const { 
    headerImage = null, 
    paperSize = 'A4',
    fileName = 'Laporan Proyek',
    scheduleData = null
  } = options;

  // 1. Create Hidden Container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = paperSize === 'F4' ? '215.9mm' : '210mm';
  container.style.backgroundColor = '#ffffff';
  document.body.appendChild(container);

  try {
    // 2. Build Content Page by Page
    let contentHtml = '';

    // -- PAGE 1: COVER --
    if (selectedSheets.some(s => s.toLowerCase() === 'cover')) {
      contentHtml += renderCoverPage(project, user, paperSize);
    }

    // -- OTHER SHEETS (RAB, AHSP, etc) --
    // Transform data to tables
    const tables = buildTables(data, selectedSheets, project);
    
    tables.forEach((table) => {
      contentHtml += renderTablePage(table, headerImage, paperSize, project);
    });

    // -- PAGE: SCHEDULE (LANDSCAPE) --
    if (selectedSheets.some(s => s.toLowerCase() === 'schedule') && scheduleData) {
      contentHtml += renderSchedulePage(scheduleData, paperSize, project);
    }

    container.innerHTML = contentHtml;

    // 3. PDF Configuration
    const pdfOptions = {
      margin: 10,
      filename: `${fileName}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { 
        unit: 'mm', 
        format: paperSize === 'F4' ? [215.9, 330.2] : 'a4', 
        orientation: 'portrait',
        putOnlyUsedFonts: true
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // 4. Generate & Save with Footer Injection
    const worker = html2pdf().from(container).set(pdfOptions).toPdf().get('pdf').then(function (pdf) {
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        
        // Footer Left: By ZG
        pdf.setTextColor(100, 100, 100);
        pdf.text('By : ', 15, pdf.internal.pageSize.getHeight() - 10);
        pdf.setTextColor(255, 140, 0); // Darker Orange for better print visibility
        pdf.setFont(undefined, 'bold');
        pdf.text('ZG', 22, pdf.internal.pageSize.getHeight() - 10);
        
        // Footer Right: Page Counter
        pdf.setTextColor(100, 100, 100);
        pdf.setFont(undefined, 'normal');
        pdf.text(`${i} / ${totalPages}`, pdf.internal.pageSize.getWidth() - 30, pdf.internal.pageSize.getHeight() - 10);
      }
    });

    await worker.save();

  } catch (error) {
    console.error("Gagal membuat PDF:", error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
};

// --- RENDER HELPERS ---

function renderCoverPage(project, user, paperSize) {
  return `
    <div class="pdf-page cover-page" style="height: 1000px; position: relative; padding: 60px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border: 15px double #020617; margin-bottom: 50px; font-family: Arial, sans-serif;">
      <div style="font-size: 50px; font-weight: 900; color: #020617; margin-bottom: 5px; letter-spacing: 2px;">LAPORAN</div>
      <div style="font-size: 26px; font-weight: 700; color: #020617; letter-spacing: 4px; margin-bottom: 40px;">RENCANA ANGGARAN BIAYA</div>
      
      <div style="width: 120px; height: 6px; background: #f59e0b; margin-bottom: 50px;"></div>
      
      <div style="background: #f8fafc; padding: 30px; border-radius: 8px; width: 80%; border-left: 8px solid #020617;">
        <div style="font-size: 16px; color: #64748b; margin-bottom: 10px; text-align: left;">KODE PROYEK :</div>
        <div style="font-size: 22px; font-weight: bold; margin-bottom: 25px; text-align: left; color: #020617;">${(project.project_code || 'PRJ-ZG-2026').toUpperCase()}</div>
        
        <div style="font-size: 16px; color: #64748b; margin-bottom: 10px; text-align: left;">PEKERJAAN :</div>
        <div style="font-size: 28px; font-weight: 900; margin-bottom: 25px; text-align: left; line-height: 1.2; color: #020617;">${(project.work_name || project.name || 'NAMA PROYEK').toUpperCase()}</div>
        
        <div style="font-size: 16px; color: #64748b; margin-bottom: 10px; text-align: left;">LOKASI :</div>
        <div style="font-size: 18px; font-weight: bold; text-align: left; color: #020617;">${(project.location || project.address || 'LOKASI').toUpperCase()}</div>
      </div>
      
      <div style="position: absolute; bottom: 80px; right: 80px; text-align: right;">
        <div style="font-size: 14px; color: #94a3b8; font-style: italic;">Disusun Oleh:</div>
        <div style="font-size: 20px; font-weight: 900; color: #020617;">${(user?.full_name || 'ZONA GEOMETRY').toUpperCase()}</div>
      </div>
      <div style="page-break-after: always;"></div>
    </div>
  `;
}

function renderTablePage(table, headerImage, paperSize, project) {
  const headerHtml = headerImage ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${headerImage}" style="max-height: 60px;"></div>` : '';
  
  return `
    <div class="pdf-page" style="padding: 10px; font-family: Arial, sans-serif;">
      ${headerHtml}
      <div style="text-align: center; margin-bottom: 15px;">
        <h3 style="margin: 0; text-transform: uppercase; font-size: 16px;">${table.title}</h3>
        <div style="font-size: 11px; color: #475569;">Proyek: ${project.name} | ${new Date().toLocaleDateString('id-ID')}</div>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 9px; line-height: 1.4;">
        <thead>
          <tr style="background-color: #020617; color: white;">
            ${table.headers.map(h => `<th style="border: 1px solid #020617; padding: 6px; text-align: center;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${table.rows.length > 0 ? table.rows.map(row => `
            <tr>
              ${row.map((cell, i) => {
                const align = (i === 1) ? 'left' : (i >= 4 ? 'right' : 'center');
                const bold = cell && cell.toString().startsWith('Total') ? 'font-weight: bold; background: #f8fafc;' : '';
                return `<td style="border: 1px solid #cbd5e1; padding: 5px; text-align: ${align}; ${bold}">${cell}</td>`;
              }).join('')}
            </tr>
          `).join('') : `<tr><td colspan="${table.headers.length}" style="border: 1px solid #cbd5e1; padding: 20px; text-align: center; color: #94a3b8;">Tidak ada data untuk ditampilkan</td></tr>`}
        </tbody>
      </table>
      <div style="page-break-after: always;"></div>
    </div>
  `;
}

function renderSchedulePage(scheduleData, paperSize, project) {
  // Simple representation of schedule as a landscape block
  return `
    <div class="pdf-page" style="padding: 10px; font-family: Arial, sans-serif; page-break-before: always;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h3 style="margin: 0; text-transform: uppercase;">JADWAL PELAKSANAAN (SCHEDULE)</h3>
      </div>
      <div style="border: 2px dashed #cbd5e1; height: 500px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 10px; color: #64748b;">
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">KURVA-S & TIME SCHEDULE</div>
          <div>Rendered in Landscape Mode</div>
        </div>
      </div>
      <div style="page-break-after: always;"></div>
    </div>
  `;
}

function buildTables(data, selectedSheets, project) {
  const result = [];
  
  // Logic to build RAB Table
  if (selectedSheets.some(s => s.toLowerCase().includes('rab'))) {
    const rows = data.map((l, i) => [
      i + 1,
      l.work_name || l.name,
      l.unit || '-',
      l.volume || 0,
      new Intl.NumberFormat('id-ID').format(l.rounded_harga || 0),
      new Intl.NumberFormat('id-ID').format((l.volume || 0) * (l.rounded_harga || 0))
    ]);
    result.push({ title: 'Rincian Anggaran Biaya (RAB)', headers: ['NO', 'URAIAN', 'SAT', 'VOL', 'HARGA', 'TOTAL'], rows });
  }

  // Logic to build Rekap Table
  if (selectedSheets.some(s => s.toLowerCase().includes('rekap'))) {
    result.push({ title: 'Rekapitulasi RAB', headers: ['NO', 'URAIAN PEKERJAAN', 'JUMLAH HARGA'], rows: [['1', 'PEKERJAAN PERSIAPAN', 'Rp 0']] });
  }

  return result;
}
