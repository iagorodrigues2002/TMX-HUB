import { DataState } from '@/components/ui/data-state';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <DataState className="min-h-64" variant="loading" title="Carregando página…" />
    </main>
  );
}
