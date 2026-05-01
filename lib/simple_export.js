import { toast } from '@/lib/toast';

/**
 * Minimalist export function to download the master template directly
 * without any processing to avoid corruption and ensure .xlsx extension.
 */
export async function downloadSimpleTemplate(projectName = 'Export') {
  try {
    const timestamp = Date.now();
    const templateUrl = `/templates/master_template_custom.xlsx?v=${timestamp}`;
    
    toast.info('Menyiapkan berkas template...');
    
    const response = await fetch(templateUrl);
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: Template not found.`);
    }

    const blob = await response.blob();
    
    // Explicitly create a new blob with the correct MIME type
    const excelBlob = new Blob([blob], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const url = window.URL.createObjectURL(excelBlob);
    const a = document.createElement('a');
    
    // Sanitize project name for filename
    const safeName = projectName.replace(/[^a-zA-Z0-9 \-_]/g, '').trim() || 'Template';
    
    a.href = url;
    a.download = `Template_Laporan_${safeName}.xlsx`;
    
    // Required for Firefox and better stability in Chrome
    document.body.appendChild(a);
    a.click();
    
    // Delay revocation to ensure browser captures the metadata
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 500);
    
    toast.success('Template berhasil diunduh!');
  } catch (error) {
    console.error('Simple Export Error:', error);
    toast.error('Gagal mengunduh template: ' + error.message);
  }
}
