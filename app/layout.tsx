import type { Metadata } from 'next';
import './globals.css';
import { ThemeController } from './theme-picker';

export const metadata: Metadata = {
  title: 'Little acorns Foxies',
  description: 'Virtuálna tabuľa plánov pre Foxies, spoločné ciele a vnorené podúlohy s priebežným progresom.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body>
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
