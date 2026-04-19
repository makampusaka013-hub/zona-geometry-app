import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import SessionGuard from '@/components/SessionGuard';
import { ToastProvider } from '@/components/Toast';

export const metadata = {
  title: 'Zona Geometry App',
  description: 'Zona Geometry App — manajemen RAB dan monitoring konstruksi',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-[#f8fafc] text-slate-900 transition-colors duration-200 dark:bg-[#020617] dark:text-slate-100">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider>
            <SessionGuard>
              {children}
            </SessionGuard>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
