import type { Metadata, Viewport } from 'next';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Blitzman — Streaming at planetary scale',
    template: '%s · Blitzman',
  },
  description:
    'An open streaming platform built in public: adaptive HLS playback, signed playback sessions, concurrency policing, and the architecture required for a billion concurrent viewers.',
  applicationName: 'Blitzman',
  authors: [{ name: '0xMudit', url: 'https://github.com/0xMudit' }],
  keywords: ['streaming', 'HLS', 'ABR', 'CDN', 'DRM', 'distributed systems'],
};

export const viewport: Viewport = {
  themeColor: '#07080c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
