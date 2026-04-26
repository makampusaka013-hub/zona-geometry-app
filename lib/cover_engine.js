/**
 * Cover Engine for Zona Geometry
 * Generates a premium architectural cover image using HTML5 Canvas
 */

export const generateCoverImage = async (project, user, options = {}) => {
  const { 
    mainImage = null, 
    logoImage = null,
    width = 1240, // A4 @ 150 DPI approx
    height = 1754 
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Background (Dark Theme)
  ctx.fillStyle = '#020617'; // Slate 950
  ctx.fillRect(0, 0, width, height);

  // 2. Decorative Elements (Aksen Arsitektur)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }

  // 3. Main Project Image (Jika ada)
  if (mainImage) {
    try {
      const img = await loadImage(mainImage);
      // Draw image in a large circular or rectangular area
      // Di sini kita buat ala-ala arsitektur (Setengah lingkaran di bawah)
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, height, width * 0.8, Math.PI, 0);
      ctx.clip();
      
      // Calculate Aspect Ratio to Fill
      const scale = Math.max(width / img.width, (height * 0.6) / img.height);
      const x = (width - img.width * scale) / 2;
      const y = (height - img.height * scale);
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      
      // Overlay gradient agar teks di atasnya terbaca
      const grad = ctx.createLinearGradient(0, height * 0.4, 0, height);
      grad.addColorStop(0, 'rgba(2, 6, 23, 0.8)');
      grad.addColorStop(0.5, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      
      ctx.restore();
    } catch (e) {
      console.error("Gagal memuat gambar utama cover:", e);
    }
  }

  // 4. Texts
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';

  // Date (Top Left)
  const dateStr = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
  ctx.font = 'bold 30px Arial';
  ctx.globalAlpha = 0.6;
  ctx.fillText(dateStr, 80, 80);
  ctx.globalAlpha = 1.0;

  // Project Code (Top Right)
  const projectCode = project.project_code || project.id?.substring(0, 8).toUpperCase() || 'ZG-PRJ-2026';
  ctx.textAlign = 'right';
  ctx.fillText(projectCode, width - 80, 80);
  ctx.textAlign = 'left';

  // Main Titles
  ctx.font = 'bold 100px Arial';
  ctx.fillText("LAPORAN", 80, 200);
  ctx.font = 'bold 70px Arial';
  ctx.fillText("RENCANA ANGGARAN BIAYA", 80, 310);

  // Accent Line
  ctx.fillStyle = '#f59e0b'; // Amber 500
  ctx.fillRect(80, 420, 400, 15);

  // Project Details
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 40px Arial';
  ctx.fillText(projectCode, 80, 500);
  
  ctx.font = 'bold 45px Arial';
  const projectName = (project.work_name || project.name || '-').toUpperCase();
  wrapText(ctx, projectName, 80, 560, width - 160, 60);

  ctx.font = '30px Arial';
  ctx.globalAlpha = 0.7;
  const location = (project.location || project.address || '-').toUpperCase();
  wrapText(ctx, location, 80, 720, width - 160, 40);
  ctx.globalAlpha = 1.0;

  // Compiled By (Bottom Right)
  ctx.textAlign = 'right';
  ctx.font = 'bold 30px Arial';
  ctx.fillText("Disusun Oleh :", width - 80, height - 150);
  ctx.font = 'bold 45px Arial';
  ctx.fillText((user?.full_name || 'ZONA GEOMETRY').toUpperCase(), width - 80, height - 100);

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

// Helper to wrap text
function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
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
}
