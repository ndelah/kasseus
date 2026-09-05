import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Kasseus — A case of your own',
  description:
    'A personal case for your next chapter. Design a Kindle Paperwhite back case with your own artwork and download a 3D-printable STL.',
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
