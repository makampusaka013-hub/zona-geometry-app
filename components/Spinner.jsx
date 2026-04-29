export default function Spinner({ size = 'md', full = false, className = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-10 h-10 border-4',
    lg: 'w-16 h-16 border-4'
  };

  const containerClasses = full 
    ? 'fixed inset-0 z-[999] flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm'
    : `flex items-center justify-center ${size !== 'sm' ? 'py-20' : ''} ${className}`;

  return (
    <div className={containerClasses}>
      <div className={`${sizeClasses[size]} border-slate-200 dark:border-slate-800 border-t-indigo-600 dark:border-t-orange-500 rounded-full animate-spin`} />
    </div>
  );
}
