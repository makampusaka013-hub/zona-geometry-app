export const CONVERSION_CATEGORIES = [
  { id: 'besi', name: 'Pembesian (Steel)', icon: 'HardHat' },
  { id: 'baja', name: 'Baja Profil (Structural)', icon: 'Layers' },
  { id: 'kayu', name: 'Kayu (Timber)', icon: 'Trees' },
  { id: 'agregat', name: 'Agregat (Sand/Stone)', icon: 'Mountain' },
  { id: 'finishing', name: 'Finishing (Tiles/Paint)', icon: 'Palette' },
  { id: 'sanitasi', name: 'Sanitasi (Pipes)', icon: 'Droplets' }
];

export const MATERIAL_DATA = {
  besi: [
    { name: 'Besi Polos 6mm', unit_src: 'm', unit_target: 'kg', factor: 0.222, note: 'SNI 0.222 kg/m' },
    { name: 'Besi Polos 6mm (Batang 12m)', unit_src: 'batang', unit_target: 'kg', factor: 2.664, note: 'SNI 2.66 kg/batang' },
    { name: 'Besi Polos 8mm', unit_src: 'm', unit_target: 'kg', factor: 0.395, note: 'SNI 0.395 kg/m' },
    { name: 'Besi Polos 8mm (Batang 12m)', unit_src: 'batang', unit_target: 'kg', factor: 4.74, note: 'SNI 4.74 kg/batang' },
    { name: 'Besi Polos 10mm', unit_src: 'm', unit_target: 'kg', factor: 0.617 },
    { name: 'Besi Polos 10mm (Batang 12m)', unit_src: 'batang', unit_target: 'kg', factor: 7.40 },
    { name: 'Besi Polos 12mm', unit_src: 'm', unit_target: 'kg', factor: 0.888 },
    { name: 'Besi Polos 12mm (Batang 12m)', unit_src: 'batang', unit_target: 'kg', factor: 10.66 },
    { name: 'Besi Ulir D13', unit_src: 'm', unit_target: 'kg', factor: 1.041 },
    { name: 'Besi Ulir D13 (Batang 12m)', unit_src: 'batang', unit_target: 'kg', factor: 12.50 },
    { name: 'Besi Ulir D16', unit_src: 'm', unit_target: 'kg', factor: 1.578 },
    { name: 'Besi Ulir D16 (Batang 12m)', unit_src: 'batang', unit_target: 'kg', factor: 18.94 },
    { name: 'Besi Ulir D19', unit_src: 'm', unit_target: 'kg', factor: 2.226 },
    { name: 'Besi Ulir D22', unit_src: 'm', unit_target: 'kg', factor: 2.984 },
    { name: 'Besi Ulir D25', unit_src: 'm', unit_target: 'kg', factor: 3.853 },
    { name: 'Besi (Batang ke Meter)', unit_src: 'batang', unit_target: 'm', factor: 12.0, note: 'Standard 12m' }
  ],
  baja: [
    { name: 'Baja IWF 150', unit_src: 'm', unit_target: 'kg', factor: 14.0 },
    { name: 'Baja IWF 200', unit_src: 'm', unit_target: 'kg', factor: 21.3 },
    { name: 'Baja IWF 250', unit_src: 'm', unit_target: 'kg', factor: 29.6 },
    { name: 'Baja IWF 300', unit_src: 'm', unit_target: 'kg', factor: 36.7 },
    { name: 'Baja C-Channel (Besi Kanal C)', unit_src: 'm', unit_target: 'kg', factor: 4.5 },
    { name: 'Baja Siku 40.40.4', unit_src: 'm', unit_target: 'kg', factor: 2.42, note: 'Siku L equal' },
    { name: 'Baja Siku 50.50.5', unit_src: 'm', unit_target: 'kg', factor: 3.77 },
    { name: 'Baja Ringan C75.75', unit_src: 'm', unit_target: 'kg', factor: 0.75, note: 'Standard t=0.75' },
    { name: 'Hollow Galvalum 4x4', unit_src: 'm', unit_target: 'kg', factor: 0.35, note: 'Estimasi' }
  ],
  kayu: [
    { name: 'Kayu Reng 2/3 (4m)', unit_src: 'm3', unit_target: 'batang', factor: 416, note: '1 m3 = 416 batang' },
    { name: 'Kayu Reng 3/4 (4m)', unit_src: 'm3', unit_target: 'batang', factor: 208, note: '1 m3 = 208 batang' },
    { name: 'Kayu Kaso 4/6 (4m)', unit_src: 'm3', unit_target: 'batang', factor: 104 },
    { name: 'Kayu Kaso 5/7 (4m)', unit_src: 'm3', unit_target: 'batang', factor: 71, note: '1 m3 = 71-72 batang' },
    { name: 'Kayu Balok 5/10 (4m)', unit_src: 'm3', unit_target: 'batang', factor: 50 },
    { name: 'Kayu Balok 6/12 (4m)', unit_src: 'm3', unit_target: 'batang', factor: 34 },
    { name: 'Kayu Balok 8/12 (4m)', unit_src: 'm3', unit_target: 'batang', factor: 26 },
    { name: 'Papan 2/20 (4m)', unit_src: 'm3', unit_target: 'lembar', factor: 62 },
    { name: 'Papan 3/20 (4m)', unit_src: 'm3', unit_target: 'lembar', factor: 41 },
    { name: 'Kayu (Batang ke Meter)', unit_src: 'batang', unit_target: 'm', factor: 4.0, note: 'Standard 4m' }
  ],
  panel: [
    { name: 'Plywood / Triplex (4\'x8\')', unit_src: 'lembar', unit_target: 'm2', factor: 2.98, note: 'Standard 122x244cm' },
    { name: 'Multiplex (4\'x8\')', unit_src: 'lembar', unit_target: 'm2', factor: 2.98 },
    { name: 'HPL (Sheet)', unit_src: 'lembar', unit_target: 'm2', factor: 2.98, note: 'Standard 122x244cm' },
    { name: 'Gypsum Board (1.2x2.4)', unit_src: 'lembar', unit_target: 'm2', factor: 2.88 },
    { name: 'GRC / Kalsiboard (1.2x2.4)', unit_src: 'lembar', unit_target: 'm2', factor: 2.88 }
  ],
  dinding: [
    { name: 'Bata Merah (m2)', unit_src: 'm2', unit_target: 'pcs', factor: 72, note: 'Standard 70-75 pcs/m2' },
    { name: 'Bata Ringan / Hebel 10cm', unit_src: 'm3', unit_target: 'pcs', factor: 83, note: 'Size 10x20x60' },
    { name: 'Bata Ringan / Hebel 7.5cm', unit_src: 'm3', unit_target: 'pcs', factor: 111, note: 'Size 7.5x20x60' },
    { name: 'Genteng Keramik', unit_src: 'm2', unit_target: 'pcs', factor: 14, note: 'Standard 14 pcs/m2' },
    { name: 'Genteng Metal (Sheet)', unit_src: 'm2', unit_target: 'lembar', factor: 1.62, note: 'Eff cover' },
    { name: 'Spandek / Trimdek', unit_src: 'm2', unit_target: 'm', factor: 1.0, note: 'Eff width 1m' }
  ],
  agregat: [
    { name: 'Pasir Beton/Pasang', unit_src: 'm3', unit_target: 'ton', factor: 1.4, note: 'Density ~1.4 t/m3' },
    { name: 'Batu Kali / Belah', unit_src: 'm3', unit_target: 'ton', factor: 1.5 },
    { name: 'Sirtu (Pasir Batu)', unit_src: 'm3', unit_target: 'ton', factor: 1.6 },
    { name: 'Tanah Urug', unit_src: 'm3', unit_target: 'ton', factor: 1.2 },
    { name: 'Split / Screening', unit_src: 'm3', unit_target: 'ton', factor: 1.7 }
  ],
  finishing: [
    { name: 'Keramik 40x40 (Isi 6)', unit_src: 'box', unit_target: 'm2', factor: 0.96 },
    { name: 'Keramik 60x60 (Isi 3)', unit_src: 'box', unit_target: 'm2', factor: 1.08 },
    { name: 'Keramik 60x60 (Isi 4)', unit_src: 'box', unit_target: 'm2', factor: 1.44 },
    { name: 'Cat Tembok (25kg)', unit_src: 'pail', unit_target: 'm2', factor: 75, note: 'Estimasi cover 2-3 lapis' },
    { name: 'Wallpaper (0.53x10m)', unit_src: 'roll', unit_target: 'm2', factor: 5.0, note: 'Estimasi waste' }
  ],
  sanitasi: [
    { name: 'Pipa PVC (Semua Dia)', unit_src: 'batang', unit_target: 'm', factor: 4.0, note: 'Standard 4m' }
  ]
};
