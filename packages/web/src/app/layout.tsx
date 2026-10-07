import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'TMX HUB · TERMINAL DE CONTROLE',
  description: 'Hub de ferramentas TMX',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Apply the persisted theme before paint to avoid a dark flash in light mode. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('tmx-ui.theme')==='light'?'light':'dark';var e=document.documentElement;e.dataset.theme=t;e.classList.toggle('dark',t==='dark');e.style.colorScheme=t}catch(_){}})()`}
        </Script>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
