import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Kasseus — Design your own Kindle case',
  description:
    'Choose your Kindle model, add artwork, and download a case and glue-in inserts as STL files for 3D printing.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
