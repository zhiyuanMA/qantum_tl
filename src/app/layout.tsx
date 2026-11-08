import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppFrame } from '@/components/AppFrame';
import { AppProvider } from '@/components/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Team Leader Readiness',
  description: 'A QAntum take-home exercise using sample data: material readiness for upcoming site visits.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <AppFrame>{children}</AppFrame>
        </AppProvider>
      </body>
    </html>
  );
}
