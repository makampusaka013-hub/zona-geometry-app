'use client';

import Image from 'next/image';

export function LogoMark({ className = "h-8" }) {
  return (
    <div className={`relative flex items-center ${className} aspect-[45/57]`}>
      <img
        src="/logo_zg_light.svg"
        alt="Zona Geometry"
        className="h-full w-auto dark:hidden"
      />
      <img
        src="/logo_zg.svg"
        alt="Zona Geometry"
        className="h-full w-auto hidden dark:block"
      />
    </div>
  );
}
