export default function Empty({ icon, msg }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e293b] text-center py-24 text-slate-400">
      <div className="flex justify-center mb-4 opacity-20">{icon}</div>
      <p className="font-bold text-slate-600 dark:text-slate-300">{msg}</p>
      <p className="text-xs mt-1">Data belum tersedia untuk kriteria ini.</p>
    </div>
  );
}
