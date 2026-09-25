import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Minex | Global Information Products',
  description:
    'The Minex is a global digital commerce company focused on information products.',
};

const sections = [
  {
    title: 'Our focus',
    body: 'The Minex is a global digital commerce company focused on information products. We develop and distribute digital educational experiences for international audiences.',
  },
  {
    title: 'Global operations',
    body: 'Our products are delivered digitally and designed to serve customers across different markets, languages, and customer journeys.',
  },
  {
    title: 'How we work',
    body: 'We combine product development, localized experiences, and responsible operational practices to make information products accessible on a global scale.',
  },
];

export default function InfoPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#020d13] px-6 py-12 text-white sm:px-10 sm:py-16">
      <div className="pointer-events-none fixed inset-0 -z-0 opacity-40 [background-image:radial-gradient(#1e6570_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(16,116,105,0.26),transparent_70%)]" />

      <article className="relative z-10 mx-auto max-w-4xl">
        <header className="border-b border-cyan-100/10 pb-12 sm:pb-16">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-cyan-300/80">
            The Minex · Company profile
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-stone-50 sm:text-6xl">
            Global information products, built for a connected world.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            We create digital products that make practical knowledge available to audiences around the world.
          </p>
        </header>

        <section className="grid gap-px bg-cyan-100/10 md:grid-cols-3" aria-label="About The Minex">
          {sections.map((section, index) => (
            <div key={section.title} className="bg-[#06161c]/95 px-7 py-9 sm:px-8">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300/70">
                0{index + 1}
              </p>
              <h2 className="mt-5 text-xl font-medium text-stone-100">{section.title}</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">{section.body}</p>
            </div>
          ))}
        </section>

        <p className="mt-12 border-t border-cyan-100/10 pt-6 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
          The Minex · Global digital commerce
        </p>
      </article>
    </main>
  );
}
