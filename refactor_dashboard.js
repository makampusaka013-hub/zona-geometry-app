const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/dashboard/page.js');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Add ThemeToggle import
if (!code.includes('ThemeToggle')) {
  code = code.replace(
    "import { supabase } from '@/lib/supabase';",
    "import { supabase } from '@/lib/supabase';\nimport { ThemeToggle } from '@/components/ThemeToggle';"
  );
}

// 2. Add ThemeToggle UI
code = code.replace(
  "Logout\n          </button>",
  "Logout\n          </button>\n          <ThemeToggle />"
);

// 3. Dark Mode theme classes modifications (rough bulk replace)
// Backgrounds
code = code.replace(/bg-slate-50\/80/g, 'bg-slate-50/80 dark:bg-[#0f172a]/80');
code = code.replace(/bg-slate-50(?![\/\-])/g, 'bg-slate-50 dark:bg-[#0f172a]');
code = code.replace(/bg-white/g, 'bg-white dark:bg-[#1e293b]');
code = code.replace(/bg-slate-900/g, 'bg-slate-900 dark:bg-amber-600'); 
code = code.replace(/hover:bg-slate-800/g, 'hover:bg-slate-800 dark:hover:bg-amber-700'); 
code = code.replace(/hover:bg-slate-50(?![\/\-])/g, 'hover:bg-slate-50 dark:hover:bg-slate-800');

// Text colors
code = code.replace(/text-slate-900/g, 'text-slate-900 dark:text-slate-100');
code = code.replace(/text-slate-800/g, 'text-slate-800 dark:text-slate-200');
code = code.replace(/text-slate-700/g, 'text-slate-700 dark:text-slate-300');
code = code.replace(/text-slate-600/g, 'text-slate-600 dark:text-slate-400');
code = code.replace(/text-slate-500/g, 'text-slate-500 dark:text-slate-400');

// Borders
code = code.replace(/border-slate-200/g, 'border-slate-200 dark:border-slate-700');
code = code.replace(/border-slate-300/g, 'border-slate-300 dark:border-slate-600');
code = code.replace(/border-t-slate-900/g, 'border-t-slate-900 dark:border-t-amber-500');

// Specific amber banner dark mode
code = code.replace(/bg-amber-50/g, 'bg-amber-50 dark:bg-amber-900/20');
code = code.replace(/border-amber-200/g, 'border-amber-200 dark:border-amber-700/30');
code = code.replace(/text-amber-900/g, 'text-amber-900 dark:text-amber-400');
code = code.replace(/text-amber-950/g, 'text-amber-950 dark:text-amber-300');

fs.writeFileSync(filePath, code);
console.log('Successfully patched dashboard/page.js!');
