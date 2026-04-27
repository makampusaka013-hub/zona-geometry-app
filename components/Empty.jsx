import React from 'react';

export default function Empty({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 bg-[#0f172a] rounded-[32px] border border-slate-800 shadow-2xl animate-in fade-in zoom-in duration-700 w-full">
      <div className="relative group mb-8">
        <div className="absolute inset-0 bg-indigo-500/10 dark:bg-orange-500/5 blur-[60px] rounded-full group-hover:blur-[100px] transition-all duration-700" />
        <div className="relative z-10 w-20 h-20 bg-slate-900/80 rounded-[2rem] flex items-center justify-center shadow-xl border border-slate-800 transform group-hover:scale-105 transition-all duration-500 ring-1 ring-slate-800/50">
          {icon && React.cloneElement(icon, { 
            className: `${icon.props.className || ''} w-10 h-10 text-indigo-600 dark:text-orange-500 stroke-[1.5px]` 
          })}
        </div>
      </div>
      
      <div className="text-center space-y-3 max-w-md relative z-10">
        <h3 className="text-xl font-black text-white tracking-tighter uppercase italic">{title}</h3>
        <p className="text-[11px] text-slate-400 font-bold leading-relaxed max-w-[280px] mx-auto">
          {description}
        </p>
      </div>
      
      {action && (
        <div className="mt-10 w-full flex justify-center">
          {action}
        </div>
      )}
    </div>
  );
}
