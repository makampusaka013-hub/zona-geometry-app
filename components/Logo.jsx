'use client';

export function Logo({ className = "h-14" }) {
  return (
    <div className={`relative flex items-center ${className} aspect-[499/330]`}>
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
