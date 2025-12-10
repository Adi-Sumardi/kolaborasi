import './globals.css';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'Dashboard Ruang Kerja Kolaborasi',
  description: 'Sistem kolaborasi untuk karyawan',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}