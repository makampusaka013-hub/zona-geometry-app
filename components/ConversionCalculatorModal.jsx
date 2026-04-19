'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, Search, Calculator as CalcIcon, HardHat, Layers, 
  Trees, Mountain, Palette, Droplets, ArrowRightLeft, 
  Check, Info
} from 'lucide-react';
import { CONVERSION_CATEGORIES, MATERIAL_DATA } from '@/lib/conversions';

export default function ConversionCalculatorModal({ isOpen, onClose, onApply, initialTitle = "Kalkulator Konversi Pintar" }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CONVERSION_CATEGORIES[0].id);
  const [inputValue, setInputValue] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);

  const filteredItems = useMemo(() => {
    let items = MATERIAL_DATA[selectedCategory] || [];
    if (searchTerm) {
      items = Object.values(MATERIAL_DATA).flat().filter(it => 
        it.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return items;
  }, [selectedCategory, searchTerm]);

  const result = useMemo(() => {
    if (!selectedItem) return 0;
    return (Number(inputValue) || 0) * selectedItem.factor;
  }, [inputValue, selectedItem]);

  if (!isOpen) return null;

  const getIcon = (catId) => {
    switch(catId) {
      case 'besi': return <HardHat className="w-4 h-4" />;
      case 'baja': return <Layers className="w-4 h-4" />;
      case 'kayu': return <Trees className="w-4 h-4" />;
      case 'agregat': return <Mountain className="w-4 h-4" />;
      case 'finishing': return <Palette className="w-4 h-4" />;
      case 'sanitasi': return <Droplets className="w-4 h-4" />;
      default: return <CalcIcon className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
              <CalcIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{initialTitle}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Kamus Konversi Material SNI & Umum</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Categories Sidebar */}
          <div className="w-full md:w-48 bg-slate-50/50 dark:bg-slate-800/30 border-r border-slate-100 dark:border-slate-800 p-4 space-y-1 overflow-y-auto">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-2">Kategori</p>
            {CONVERSION_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setSearchTerm(''); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${selectedCategory === cat.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                {getIcon(cat.id)}
                {cat.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Main Area */}
          <div className="flex-1 flex flex-col p-6 space-y-6 overflow-hidden">
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari material (contoh: Besi 6mm, Kayu 5/7)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[1.25rem] text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 ring-indigo-500/20 outline-none"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
              {filteredItems.map((it, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedItem(it)}
                  className={`w-full p-4 rounded-2xl border transition-all text-left group ${selectedItem === it ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20 ring-1 ring-indigo-600' : 'border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">{it.name}</span>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-orange-500">{it.unit_src} ➔ {it.unit_target}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{it.note || `Faktor: ${it.factor}`}</span>
                    {selectedItem === it && <Check className="w-3 h-3 text-indigo-600 ml-auto" />}
                  </div>
                </button>
              ))}
              {filteredItems.length === 0 && (
                <div className="text-center py-10 opacity-40">
                  <Info className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Material tidak ditemukan</p>
                </div>
              )}
            </div>

            {/* Calculator Interface */}
            {selectedItem && (
              <div className="bg-slate-900 dark:bg-slate-800 rounded-3xl p-6 text-white shadow-xl animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="flex-1 w-full space-y-2">
                    <label className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Input ({selectedItem.unit_src})</label>
                    <input 
                      type="number" 
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-lg font-mono font-black border-none focus:ring-2 ring-indigo-500/50 outline-none"
                    />
                  </div>
                  
                  <div className="shrink-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                      <ArrowRightLeft className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <label className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Hasil ({selectedItem.unit_target})</label>
                    <div className="w-full bg-white/5 rounded-xl px-4 py-3 text-lg font-mono font-black text-emerald-400 flex items-center justify-between">
                      {result.toLocaleString('id-ID', { minimumFractionDigits: 3 })}
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => onApply(result)}
                  className="w-full mt-6 py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-900/40"
                >
                  Terapkan Hasil Ke Form
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
