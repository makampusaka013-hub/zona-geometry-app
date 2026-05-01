import { toast } from '@/lib/toast';

/**
 * Enhanced Simple Export using Data URL for better filename reliability
 * on some browsers that ignore blob download attributes.
 */
export async function downloadSimpleTemplate(projectName = 'Export') {
  try {
    const timestamp = Date.now();
    const templateUrl = `/templates/master_template_custom.xlsx?v=${timestamp}`;
    
    toast.info('Menyiapkan berkas (Data Stream)...');
    
    const response = await fetch(templateUrl);
    
    if (!response.ok) {
      throw new Error(`Template tidak ditemukan di server.`);
    }

    const blob = await response.blob();
    
    // Convert Blob to Base64 to use as a Data URL
    // This is often more reliable for forced filenames in strict browsers
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result;
      const a = document.createElement('a');
      
      const safeName = projectName.replace(/[^a-zA-Z0-9 \-_]/g, '').trim() || 'Project';
      const fileName = `Laporan_${safeName}.xlsx`;
      
      a.href = base64data;
      a.setAttribute('download', fileName);
      
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
      }, 1000);
      
      toast.success('File dikirim ke browser.');
    };
    
    reader.readAsDataURL(blob);
    
  } catch (error) {
    console.error('Simple Export Error:', error);
    toast.error('Gagal: ' + error.message);
  }
}
