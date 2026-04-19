'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, MapPin, Search } from 'lucide-react';

export default function LocationSelect({ value, locationId, onChange, locations, placeholder = "Ketik atau Pilih Wilayah..." }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const wrapperRef = useRef(null);

  // Sync internal query with external value (e.g. from parent state)
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query === '' 
    ? locations 
    : locations.filter(loc => loc.name && loc.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Search Input - Can be typed manually */}
      <div className="relative group">
        <MapPin className={`absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors z-10 pointer-events-none ${value ? 'text-indigo-600 dark:text-orange-500' : 'text-slate-300'}`} />
        
        <input 
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            onChange(null, val); // set id to null when typing manually
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/10 dark:text-white transition-all shadow-inner placeholder:text-slate-400 placeholder:font-normal"
        />

        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute z-[110] mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-y-auto py-2 scrollbar-hide">
            {filtered.length > 0 ? (
              filtered.map(loc => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => {
                    onChange(loc.id, loc.name);
                    setOpen(false);
                  }}
                  className={`w-full px-5 py-3 text-[10px] font-bold text-left flex items-center justify-between transition-colors ${
                    locationId === loc.id 
                      ? 'bg-indigo-50 dark:bg-orange-500/10 text-indigo-600 dark:text-orange-400' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {loc.name}
                  {locationId === loc.id && <Check className="w-3 h-3" />}
                </button>
              ))
            ) : query.length > 0 && (
              <div className="px-5 py-3 text-[10px] italic text-slate-400">
                Lanjut ketik untuk wilayah baru: "{query}"
              </div>
            )}
            {filtered.length === 0 && query.length === 0 && (
              <div className="px-5 py-4 text-center text-[10px] text-slate-400">
                Pilih atau ketik wilayah baru...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
