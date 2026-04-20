'use client';

export function Logo({ className = "h-14" }) {
  return (
    <div className={`relative flex items-center ${className} aspect-[199/138]`}>
      {/* Light Theme Logo (Blue) */}
      <img
        src="/logo_Text_light.svg"
        alt="Zona Geometry"
        className="h-full w-auto dark:hidden"
      />
      {/* Dark Theme Logo (Orange) */}
      <img
        src="/logo_Text.svg"
        alt="Zona Geometry"
        className="h-full w-auto hidden dark:block"
      />
    </div>
  );
}
