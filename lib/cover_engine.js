/**
 * Cover Engine for Zona Geometry
 * Generates a premium architectural cover image using HTML5 Canvas
 */

export const generateCoverImage = async (project, user, options = {}) => {
  const { 
    mainImage = null, 
    width = 1240, 
    height = 1754,
    grandTotal = 0 
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Background (Gunakan template default jika tidak ada gambar custom)
  const bgSource = mainImage || '/templates/cover.jpg';
  try {
    const bgImg = await loadImage(bgSource);
    ctx.drawImage(bgImg, 0, 0, width, height);
  } catch (e) {
    // Fallback jika gambar gagal dimuat
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';

  // 2. Bulan - Tahun (Top Left)
  const dateStr = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
  ctx.font = 'bold 35px Arial';
  ctx.fillText(dateStr, 80, 80);

  // 3. Blok Informasi Proyek (Di bawah tulisan "Anggaran Biaya" pada gambar)
  // Berdasarkan gambar, posisi teks harus dimulai sekitar baris ke-400 ke bawah
  let currentY = 400; 

  // Nomor Kontrak
  ctx.font = 'bold 35px Arial';
  const projectCode = project.project_code || project.id?.substring(0, 8).toUpperCase() || 'ZG-PRJ-2026';
  ctx.fillText(projectCode, 200, currentY);
  currentY += 50;

  // Nama Proyek
  ctx.font = 'bold 50px Arial';
  const projectName = (project.work_name || project.name || '-').toUpperCase();
  currentY = wrapText(ctx, projectName, 200, currentY, width - 400, 60);
  currentY += 20;

  // Alamat Lengkap
  ctx.font = '35px Arial';
  ctx.globalAlpha = 0.8;
  const location = (project.location || project.address || '-').toUpperCase();
  wrapText(ctx, location, 200, currentY, width - 400, 45);
  ctx.globalAlpha = 1.0;

  // 4. Total RAB Profit + PPN (Bottom Right)
  if (grandTotal > 0) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 30px Arial';
    ctx.globalAlpha = 0.7;
    ctx.fillText("TOTAL HARGA KONTRAK (PROFIT + PPN) :", width - 80, height - 160);
    
    ctx.font = 'bold 60px Arial';
    ctx.globalAlpha = 1.0;
    const formatIdr = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
    ctx.fillText(formatIdr(grandTotal), width - 80, height - 120);
  }

  return canvas.toDataURL('image/png');
};

// Helper to load image
const loadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

// Helper to wrap text (Modified to return last Y)
function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = (text || '').split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = context.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, y);
  return y + lineHeight;
}

