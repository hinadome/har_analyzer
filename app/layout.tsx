import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HAR Analyzer',
  description: 'Analyze and compare HAR (HTTP Archive) files',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
