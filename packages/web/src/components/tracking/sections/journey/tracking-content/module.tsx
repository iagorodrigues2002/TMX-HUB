'use client';

export function Module({
  title,
  description,
  children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="glass-card rounded-lg border border-border bg-muted p-5 md:p-6">
      <p className="hud-label">Rastreamento avançado</p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mb-6 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
