import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import SessionGuard from '@/components/SessionGuard';
import { ToastProvider } from '@/components/Toast';

export const metadata = {
  metadataBase: new URL('https://zonageometry.id'),
  title: 'Zona Geometry - Aplikasi RAB Pro, AHSP 2026 & Monitoring Konstruksi',
  description: 'Zona Geometry adalah aplikasi RAB Pro terbaik untuk penyusunan AHSP 2026, RAB BIM (IFC), dan laporan konstruksi digital secara online, akurat, dan terintegrasi.',
  keywords: [
    'aplikasi rab pro', 
    'aplikasi rab ahsp 2026', 
    'rab online', 
    'rab BIM (ifc)', 
    'pembuatan laporan rab',
    'monitoring konstruksi digital',
    'estimasi biaya proyek'
  ],
  authors: [{ name: 'Zona Geometry Team' }],
  creator: 'Zona Geometry',
  publisher: 'Zona Geometry',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: 'any', type: 'image/png' },
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.png', sizes: '144x144', type: 'image/png' },
      { url: '/favicon.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: [
      { url: '/favicon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'Cauj6JOJucfu6SRppTlkJ9MpOxr8fxGTlCRc4pmtAe0',
  },
  openGraph: {
    title: 'Zona Geometry - Aplikasi RAB Pro & Monitoring Konstruksi',
    description: 'Kelola RAB, AHSP 2026, dan proyek konstruksi Anda secara digital dengan Zona Geometry.',
    url: 'https://zonageometry.id',
    siteName: 'Zona Geometry',
    locale: 'id_ID',
    type: 'website',
    images: [
      {
        url: '/images/og-zona-geometry.jpg',
        width: 1200,
        height: 630,
        alt: 'Zona Geometry - Digital Construction Management',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zona Geometry - Solusi Konstruksi Digital',
    description: 'Penyusunan RAB dan AHSP 2026 jadi lebih cepat dan akurat.',
    images: ['/images/og-zona-geometry.jpg'],
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
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "WebSite",
                "name": "Zona Geometry",
                "url": "https://zonageometry.id"
              })
            }}
          />
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
