'use client';

export function Logo({ className = "h-14" }) {
  return (
    <div className={`relative flex items-center ${className} aspect-[199/138]`}>
      <img
        src="/logo_Text_light.svg"
        alt="Zona Geometry"
        className="h-full w-auto dark:hidden"
      />
      <img
        src="/logo_Text.svg"
        alt="Zona Geometry"
        className="h-full w-auto hidden dark:block"
      />
    </div>
  );
}
