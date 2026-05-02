import { createClient } from '@supabase/supabase-client'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function checkDb() {
  const { data: proj } = await supabase.from('projects').select('id, name').ilike('name', '%gedung 1%').limit(1).single()
  if (!proj) {
    console.log('Project "gedung 1" not found')
    return
  }
  console.log('Found Project:', proj.name, 'ID:', proj.id)

  const { count: ahspCount } = await supabase.from('ahsp_lines').select('*', { count: 'exact', head: true }).eq('project_id', proj.id)
  console.log('AHSP Lines Count:', ahspCount)

  const { data: ahspWithId } = await supabase.from('ahsp_lines').select('id, master_ahsp_id').eq('project_id', proj.id).not('master_ahsp_id', 'is', null)
  console.log('AHSP Lines with master_ahsp_id:', ahspWithId?.length || 0)

  const { data: resSummary } = await supabase.from('view_project_resource_summary').select('*').eq('project_id', proj.id)
  console.log('Resource Summary Count:', resSummary?.length || 0)
  if (resSummary?.length > 0) {
    console.log('First resource:', resSummary[0].uraian)
  }
}

checkDb()
