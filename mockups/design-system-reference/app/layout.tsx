import type { ReactNode } from 'react';
import '../../../packages/web/src/app/globals.css';

export const metadata = {
  title: 'TMX · Referência do design system',
  robots: { index: false, follow: false },
};

export default function ReferenceLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
