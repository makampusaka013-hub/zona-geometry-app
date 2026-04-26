'use client';

export function LogoHero({ className = "h-24" }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img
        src="/logo_zg_light.svg"
        alt="ZG Icon"
        className="h-full w-auto dark:hidden"
      />
      <img
        src="/logo_zg.svg"
        alt="ZG Icon"
        className="h-full w-auto hidden dark:block"
      />
    </div>
  );
}
