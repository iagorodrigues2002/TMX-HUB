'use client';

export function Module({
  title,
  description,
  children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
      <p className="hud-label">Rastreamento avançado</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <p className="mb-6 mt-2 max-w-2xl text-sm leading-6 text-white/50">{description}</p>
      {children}
    </section>
  );
}
