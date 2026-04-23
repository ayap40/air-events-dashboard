import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Air Events Dashboard',
  description: 'Internal events management dashboard',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
