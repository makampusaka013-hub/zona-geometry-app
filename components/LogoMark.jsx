'use client';

import Image from 'next/image';

export function LogoMark({ className = "h-8" }) {
  return (
    <div className={`relative flex items-center ${className} text-blue-600 dark:text-orange-500 transition-colors duration-300`}>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 45 57"
        className="h-full w-auto"
        fill="none"
      >
        <path fill="currentColor" d="M41.4 53.65l-16.03 -27.77 2.1 -3.62 20.06 34.79 -47.53 0 30.9 -53.53 -14.23 0 3.65 6.36c0.16,-0.11 1.74,-2.97 2.08,-3.56l4.05 0 -6.16 10.61 -9.72 -16.93 26.42 0 -30.95 53.62 35.36 0.03zm-30.3 -3.15l25.33 0 -9.02 -15.58 -5.18 9.02 4.09 0 1.15 -1.94 2.83 4.97 -13.07 0c2.61,-4.93 5.76,-10.04 8.59,-14.89l-2 -3.49 -12.72 21.91z"/>
      </svg>
    </div>
  );
}
