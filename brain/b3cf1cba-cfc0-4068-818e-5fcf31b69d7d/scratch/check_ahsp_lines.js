const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkAhspLines() {
  const { data, error } = await supabase.from('ahsp_lines').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('AhspLines Columns:', Object.keys(data[0] || {}));
  }
}

checkAhspLines();
