import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Little acorns Foxies',
  description: 'Modrá virtuálna tabuľa plánov pre Foxies, spoločné ciele a vnorené podúlohy s priebežným progresom.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body>
        {children}
      </body>
    </html>
  );
}
