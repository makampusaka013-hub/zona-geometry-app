'use client';

export function Logo({ className = "h-14" }) {
  return (
    <div className={`relative flex items-center ${className} aspect-[199/138]`}>
      {/* Use the new generated logo for both themes or keep simple */}
      <img
        src="/logo.png"
        alt="Zona Geometry"
        className="h-full w-auto"
      />
    </div>
  );
}
