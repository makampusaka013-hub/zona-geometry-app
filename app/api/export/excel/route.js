import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import { fetchRabData, fetchProjectResourceSummary, fetchAhspDetailsInBulk } from '@/lib/services/rabService';
import { fillExcelData } from '@/lib/excel/generator';

// Simple concurrency control for serverless instances
let activeJobs = 0;
const MAX_CONCURRENT_JOBS = 5;

export async function POST(request) {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return NextResponse.json({ 
      error: 'Server sedang sibuk memproses banyak dokumen. Silakan coba lagi dalam beberapa saat.' 
    }, { status: 503 });
  }

  activeJobs++;
  try {
    const { projectId, selectedSheets, options } = await request.json();
    
    // 1. Setup Supabase Server Client
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value; },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1.5 Rate Limiting Check
    const { data: canExport, error: rateError } = await supabase.rpc('check_and_increment_export_limit');
    if (rateError || !canExport) {
      return NextResponse.json({ 
        error: 'Limit ekspor harian tercapai atau permintaan terlalu cepat. Silakan coba lagi nanti.' 
      }, { status: 429 });
    }

    // 2. Fetch Data
    const { project, lines, masterPrices, error } = await fetchRabData(projectId);
    if (error) throw error;

    // Fetch details for lines if missing
    const missingDetailIds = lines.filter(l => l.master_ahsp_id && !l.master_ahsp?.details && (!l.analisa_custom || l.analisa_custom.length === 0)).map(l => l.master_ahsp_id);
    if (missingDetailIds.length > 0) {
      const { data: detailsData } = await fetchAhspDetailsInBulk(missingDetailIds);
      if (detailsData) {
        const detailMap = Object.fromEntries(detailsData.map(d => [d.master_ahsp_id, d.details]));
        lines.forEach(l => { 
          if (l.master_ahsp_id && detailMap[l.master_ahsp_id]) { 
            if (!l.master_ahsp) l.master_ahsp = {}; 
            l.master_ahsp.details = detailMap[l.master_ahsp_id]; 
          } 
        });
      }
    }

    // Fetch resources for pricing
    const { projectResources, catalogResources, overrideResources } = await fetchProjectResourceSummary(projectId, project.location_id);
    const mergedMap = {};
    (catalogResources || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
    (projectResources || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
    (overrideResources || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
    const projectPrices = Object.entries(mergedMap).map(([kode_item, harga_satuan]) => ({ kode_item, harga_satuan }));

    // 3. Load Template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'master_template_custom.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // 4. Run Generation Logic
    await fillExcelData(workbook, project, user, lines, selectedSheets, { 
      ...options,
      projectPrices
    });
    
    // 5. Return as Stream
    const buffer = await workbook.xlsx.writeBuffer();
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Export_${project.name}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    activeJobs--;
  }
}
