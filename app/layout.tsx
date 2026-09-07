import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'SchedU · Tutorial booking',
  description:
    'Make room for learning. Book face-to-face university tutorials, manage your schedule and follow your progress.',
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
