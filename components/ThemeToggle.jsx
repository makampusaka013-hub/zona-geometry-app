"use client"

import * as React from "react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="relative group flex items-center justify-center">
        <button className="rounded-lg p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        </button>
        {/* Tooltip Kustom di Bawah */}
        <span className="absolute top-[45px] left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-bold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl whitespace-nowrap z-50">
          Ubah ke Mode Gelap
        </span>
      </div>
    )
  }

  const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark")

  return (
    <div className="relative group flex items-center justify-center">
      <button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-slate-800"
      >
        {isDark ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        )}
      </button>
      {/* Tooltip Kustom di Bawah */}
      <span className="absolute top-[45px] left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-bold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl whitespace-nowrap z-50">
        {isDark ? "Ubah ke Mode Terang" : "Ubah ke Mode Gelap"}
      </span>
    </div>
  )
}
