'use client';

import Image from 'next/image';

export function LogoMark({ className = "h-8" }) {
  return (
    <div className={`relative flex items-center ${className} aspect-[5/6]`}>
      {/* Use the new generated logo mark */}
      <img
        src="/logo.png"
        alt="Zona Geometry"
        className="h-full w-auto"
      />
    </div>
  );
}
