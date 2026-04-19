import React, { useState } from 'react';
import { 
  X, Calculator, Layers, Layout, ChevronRight, Hash, 
  ArrowRight, Info, CheckCircle2, Ruler
} from 'lucide-react';

const STEEL_COEFFICIENTS = [
  { diameter: 6, weight: 0.222 },
  { diameter: 8, weight: 0.395 },
  { diameter: 10, weight: 0.617 },
  { diameter: 12, weight: 0.888 },
  { diameter: 13, weight: 1.042 },
  { diameter: 16, weight: 1.578 },
  { diameter: 19, weight: 2.226 },
  { diameter: 22, weight: 2.984 },
  { diameter: 25, weight: 3.853 },
  { diameter: 28, weight: 4.83 },
  { diameter: 32, weight: 6.31 }
];

export default function SteelCalculationModal({ isOpen, onClose, onApply }) {
  const [activeTab, setActiveTab] = useState('sloof'); // 'sloof' (also for kolom/balok) or 'dak'
  
  // State for Sloof/Kolom/Balok
  const [sloof, setSloof] = useState({
    nama: 'Besi Sloof S1',
    panjangTotal: 10,
    diaUtama: 10,
    jmlUtama: 4,
    diaSengkang: 6,
    lebarPenampang: 15,
    tinggiPenampang: 20,
    jarakSengkang: 15, // cm
    waste: 5 // %
  });

  // State for Dak
  const [dak, setDak] = useState({
    nama: 'Besi Dak Beton',
    luas: 20,
    diameter: 10,
    jarak: 15, // cm
    layers: 2,
    waste: 5 // %
  });

  if (!isOpen) return null;

  const getWeight = (dia) => STEEL_COEFFICIENTS.find(c => c.diameter === Number(dia))?.weight || 0;

  const calculateSloof = () => {
    const coeffUtama = getWeight(sloof.diaUtama);
    const weightUtama = sloof.panjangTotal * sloof.jmlUtama * coeffUtama * (1 + sloof.waste/100);
    
    // Sengkang: Keliling = 2 * ((b-5) + (h-5)) + 10cm hook (rough estimate 5cm concrete cover total)
    const kelilingSengkang = ( (sloof.lebarPenampang - 4) + (sloof.tinggiPenampang - 4) ) * 2 / 100 + 0.1; // in meters
    const jmlSengkang = (sloof.panjangTotal / (sloof.jarakSengkang / 100)) + 1;
    const coeffSengkang = getWeight(sloof.diaSengkang);
    const weightSengkang = kelilingSengkang * jmlSengkang * coeffSengkang * (1 + sloof.waste/100);

    return [
      {
        uraian: `${sloof.nama} - Besi Utama D${sloof.diaUtama} (${sloof.jmlUtama} bh)`,
        p: sloof.panjangTotal,
        l: sloof.jmlUtama,
        t: 1,
        qty: 1,
        konversi: coeffUtama * (1 + sloof.waste/100),
        total: weightUtama
      },
      {
        uraian: `${sloof.nama} - Beugel/Sengkang D${sloof.diaSengkang}-${sloof.jarakSengkang}`,
        p: kelilingSengkang,
        l: Math.ceil(jmlSengkang),
        t: 1,
        qty: 1,
        konversi: coeffSengkang * (1 + sloof.waste/100),
        total: weightSengkang
      }
    ];
  };

  const calculateDak = () => {
    // Simplified mesh calculation: (Area / Spacing) * 2 directions * Layers
    const coeff = getWeight(dak.diameter);
    const panjangPerM2 = (1 / (dak.jarak / 100)) * 2;
    const totalPanjang = dak.luas * panjangPerM2 * dak.layers;
    const totalWeight = totalPanjang * coeff * (1 + dak.waste/100);

    return [
      {
        uraian: `${dak.nama} - D${dak.diameter}-${dak.jarak} (${dak.layers} Lapis)`,
        p: dak.luas,
        l: panjangPerM2,
        t: dak.layers,
        qty: 1,
        konversi: coeff * (1 + dak.waste/100),
        total: totalWeight
      }
    ];
  };

  const handleApply = () => {
    const results = activeTab === 'sloof' ? calculateSloof() : calculateDak();
    onApply(results);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg ring-4 ring-indigo-500/10">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Kalkulator Pembesian Pintar</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Automasi Perhitungan Volume Besi Struktur</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-8 pt-6 flex gap-2">
          <button 
            onClick={() => setActiveTab('sloof')}
            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black transition-all border-2 ${activeTab === 'sloof' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}
          >
            <Layout className="w-4 h-4" />
            SLOOF / KOLOM / BALOK
          </button>
          <button 
            onClick={() => setActiveTab('dak')}
            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black transition-all border-2 ${activeTab === 'dak' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}
          >
            <Layers className="w-4 h-4" />
            DAK BETON / PLAT
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          
          {activeTab === 'sloof' ? (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2 space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nama Elemen</label>
                    <input 
                      value={sloof.nama} 
                      onChange={e => setSloof({...sloof, nama: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold outline-none dark:text-white"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Panjang Total (m')</label>
                    <input 
                      type="number"
                      value={sloof.panjangTotal} 
                      onChange={e => setSloof({...sloof, panjangTotal: Number(e.target.value)})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-black dark:text-white font-mono"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Waste Factor (%)</label>
                    <input 
                      type="number"
                      value={sloof.waste} 
                      onChange={e => setSloof({...sloof, waste: Number(e.target.value)})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-black dark:text-white font-mono"
                    />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-6 p-6 rounded-3xl bg-indigo-50/50 dark:bg-slate-800/50 border border-indigo-100 dark:border-slate-800">
                 <div className="col-span-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <ChevronRight className="w-3 h-3" />
                    Besi Utama (Tulangan Pokok)
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Diameter (mm)</label>
                    <select 
                       value={sloof.diaUtama}
                       onChange={e => setSloof({...sloof, diaUtama: Number(e.target.value)})}
                       className="w-full bg-white dark:bg-slate-900 border-2 border-indigo-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-black outline-none"
                    >
                       {STEEL_COEFFICIENTS.map(c => <option key={c.diameter} value={c.diameter}>D{c.diameter}</option>)}
                    </select>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Jumlah Batang (bh)</label>
                    <input 
                      type="number"
                      value={sloof.jmlUtama} 
                      onChange={e => setSloof({...sloof, jmlUtama: Number(e.target.value)})}
                      className="w-full bg-white dark:bg-slate-900 border-2 border-indigo-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-black font-mono"
                    />
                 </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                 <div className="col-span-3 text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ChevronRight className="w-3 h-3" />
                    Sengkang (Beugel)
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dia (mm)</label>
                    <select 
                       value={sloof.diaSengkang}
                       onChange={e => setSloof({...sloof, diaSengkang: Number(e.target.value)})}
                       className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-black outline-none"
                    >
                       {STEEL_COEFFICIENTS.map(c => <option key={c.diameter} value={c.diameter}>D{c.diameter}</option>)}
                    </select>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Jarak (cm)</label>
                    <input 
                      type="number"
                      value={sloof.jarakSengkang} 
                      onChange={e => setSloof({...sloof, jarakSengkang: Number(e.target.value)})}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-black font-mono"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">b x h (cm)</label>
                    <div className="flex items-center gap-1">
                       <input 
                         type="number" value={sloof.lebarPenampang} onChange={e => setSloof({...sloof, lebarPenampang: Number(e.target.value)})}
                         className="w-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-center"
                       />
                       <span className="text-slate-300">x</span>
                       <input 
                         type="number" value={sloof.tinggiPenampang} onChange={e => setSloof({...sloof, tinggiPenampang: Number(e.target.value)})}
                         className="w-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-center"
                       />
                    </div>
                 </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
               <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nama Pekerjaan</label>
                  <input 
                    value={dak.nama} 
                    onChange={e => setDak({...dak, nama: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold outline-none dark:text-white"
                  />
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Luas Area (m2)</label>
                     <input 
                       type="number"
                       value={dak.luas} 
                       onChange={e => setDak({...dak, luas: Number(e.target.value)})}
                       className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-black dark:text-white font-mono"
                     />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Tebal / Lapisan</label>
                     <select 
                       value={dak.layers}
                       onChange={e => setDak({...dak, layers: Number(e.target.value)})}
                       className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-black dark:text-white outline-none"
                     >
                        <option value={1}>1 Lapis (Single Mesh)</option>
                        <option value={2}>2 Lapis (Double Mesh)</option>
                     </select>
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Diameter Besi (mm)</label>
                     <select 
                       value={dak.diameter}
                       onChange={e => setDak({...dak, diameter: Number(e.target.value)})}
                       className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-black dark:text-white outline-none"
                     >
                        {STEEL_COEFFICIENTS.map(c => <option key={c.diameter} value={c.diameter}>D{c.diameter}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Jarak Spasi (cm)</label>
                     <input 
                       type="number"
                       value={dak.jarak} 
                       onChange={e => setDak({...dak, jarak: Number(e.target.value)})}
                       className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-black dark:text-white font-mono"
                     />
                  </div>
               </div>
            </div>
          )}

          {/* Results Summary Interface */}
          <div className="p-6 rounded-[28px] bg-slate-900 text-white shadow-xl shadow-slate-200 dark:shadow-none relative overflow-hidden group">
             <div className="relative z-10 flex items-center justify-between">
                <div>
                   <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]">Estimasi Total Berat</span>
                   <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-mono font-black">
                         {(activeTab === 'sloof' 
                             ? calculateSloof().reduce((sum, r) => sum + r.total, 0) 
                             : calculateDak()[0].total).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs font-bold text-slate-400 uppercase">KG</span>
                   </div>
                </div>
                <button 
                   onClick={handleApply}
                   className="px-6 py-4 bg-white text-slate-900 rounded-2xl text-xs font-black shadow-lg hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-2"
                >
                   TERAPKAN KE BACKUP
                   <ArrowRight className="w-4 h-4" />
                </button>
             </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
           <Info className="w-4 h-4 text-indigo-500 shrink-0" />
           <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium italic">
              * Perhitungan menggunakan standar berat jenis baja SNI 7850 kg/m3. Hasil akan dipecah menjadi beberapa segmen uraian di tabel backup volume.
           </p>
        </div>
      </div>
    </div>
  );
}
