'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SpyAdsList } from './spy-ads-list';
export function SpyAllAds() {
  const params = useSearchParams();
  const id = params.get('id');
  const at = params.get('at');
  return (
    <main style={{ padding: 24 }}>
      <Link href="/spy">← Voltar às ofertas</Link>
      {id && at ? (
        <SpyAdsList id={id} at={at} all />
      ) : (
        <p>Abra os anúncios a partir de uma oferta.</p>
      )}
    </main>
  );
}
