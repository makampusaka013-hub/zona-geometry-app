'use client';

import Image from 'next/image';

export function LogoMark({ className = "h-8" }) {
  return (
    <div className={`relative flex items-center ${className} aspect-[5/6]`}>
      <img
        src="/logo_light.svg"
        alt="Zona Geometry"
        className="h-full w-auto dark:hidden"
      />
      <img
        src="/logo.svg"
        alt="Zona Geometry"
        className="h-full w-auto hidden dark:block"
      />
    </div>
  );
}
