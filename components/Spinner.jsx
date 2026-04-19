export default function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-indigo-600 dark:border-t-orange-500 rounded-full animate-spin" />
    </div>
  );
}
