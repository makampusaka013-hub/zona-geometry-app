import { toast } from '@/lib/toast';

/**
 * Enhanced Simple Export using Data URL for better filename reliability
 * on some browsers that ignore blob download attributes.
 */
export async function downloadSimpleTemplate(projectName = 'Export') {
  try {
    toast.info('Mengunduh langsung dari server...');
    
    // Metode Direct Link: Paling aman dari blokir penamaan browser
    // Karena ini adalah file statis di folder public
    const link = document.createElement('a');
    link.href = '/templates/master_template_custom.xlsx';
    link.download = `Laporan_Proyek_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Unduhan dimulai.');
  } catch (error) {
    console.error('Simple Export Error:', error);
    toast.error('Gagal: ' + error.message);
  }
}
