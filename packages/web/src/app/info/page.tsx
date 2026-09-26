import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Minex | Global Digital Commerce',
  description: 'The Minex is a global digital commerce company creating and operating information products for international audiences.',
};

const principles = [
  ['01', 'Information with purpose', 'We create and operate information products that turn specialized knowledge into practical, accessible digital experiences.'],
  ['02', 'Global by design', 'Our digital delivery model lets us serve customers across markets while adapting product journeys to local languages, needs, and contexts.'],
  ['03', 'Built to operate', 'We bring together product, technology, analytics, and customer operations to build reliable businesses around digital knowledge.'],
];

const operatingAreas = [
  ['Product development', 'From research and content structure to the complete digital product experience.'],
  ['International commerce', 'Localized offers, checkout journeys, and digital delivery for global audiences.'],
  ['Performance intelligence', 'Measurement systems that help us understand product performance across markets.'],
  ['Customer experience', 'Clear information and thoughtful post-purchase journeys throughout the customer lifecycle.'],
];

export default function InfoPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#020d13] px-5 py-6 text-white sm:px-10 sm:py-10">
      <div className="pointer-events-none fixed inset-0 -z-0 opacity-35 [background-image:radial-gradient(#1e6570_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[38rem] bg-[radial-gradient(ellipse_at_top,rgba(16,116,105,0.32),transparent_68%)]" />

      <article className="relative z-10 mx-auto max-w-6xl">
        <header className="border-b border-cyan-100/15 pb-12 pt-5 sm:pb-20 sm:pt-8">
          <div className="flex items-center justify-between gap-5 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200/80 sm:text-xs">
            <span>The Minex</span><span>Company profile · 2026</span>
          </div>
          <div className="mt-16 grid gap-12 lg:grid-cols-[1.45fr_0.55fr] lg:items-end">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300/80">Global digital commerce</p>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.055em] text-stone-50 sm:text-7xl">Information products for a world without borders.</h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">The Minex builds, operates, and scales digital information products for international audiences. We combine useful knowledge with disciplined technology and commerce operations.</p>
            </div>
            <div className="border-l border-cyan-200/20 pb-1 pl-6 sm:pl-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Monthly digital commerce volume</p>
              <p className="mt-4 text-4xl font-medium tracking-[-0.04em] text-cyan-200 sm:text-5xl">US$100K+</p>
              <p className="mt-3 text-sm leading-6 text-slate-400">in monthly sales across our information-product portfolio.</p>
            </div>
          </div>
        </header>

        <section className="grid border-b border-cyan-100/10 py-14 sm:grid-cols-[0.8fr_1.2fr] sm:gap-16 sm:py-20" aria-labelledby="about-title">
          <div><p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300/75">About us</p><h2 id="about-title" className="mt-4 text-3xl font-medium tracking-[-0.035em] text-stone-100">A company built around useful knowledge.</h2></div>
          <div className="mt-7 space-y-5 text-base leading-8 text-slate-300 sm:mt-0 sm:text-lg"><p>We believe information can become a meaningful product when it is clear, relevant, and delivered with care. Our work begins with product development and continues through every part of the digital commerce experience.</p><p>From our operating base in Brazil, we serve a growing international customer base through digital-first products, localized journeys, and data-informed decision making.</p></div>
        </section>

        <section className="py-14 sm:py-20" aria-labelledby="principles-title">
          <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300/75">What guides us</p><h2 id="principles-title" className="mt-4 text-3xl font-medium tracking-[-0.035em] text-stone-100">The way we build.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-400">A focused operating model for building durable, international digital products.</p></div>
          <div className="mt-10 grid gap-px border border-cyan-100/10 bg-cyan-100/10 md:grid-cols-3">
            {principles.map(([number, title, body]) => <div key={number} className="min-h-64 bg-[#06161c]/95 p-7 sm:p-8"><p className="font-mono text-xs tracking-[0.2em] text-cyan-300/70">{number}</p><h3 className="mt-12 text-2xl font-medium tracking-[-0.03em] text-stone-100">{title}</h3><p className="mt-4 text-sm leading-7 text-slate-300">{body}</p></div>)}
          </div>
        </section>

        <section className="border-y border-cyan-100/10 py-14 sm:py-20" aria-labelledby="operations-title">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300/75">Operating model</p><h2 id="operations-title" className="mt-4 max-w-2xl text-3xl font-medium tracking-[-0.035em] text-stone-100">From product insight to a complete customer journey.</h2>
          <div className="mt-12 grid gap-x-12 gap-y-8 md:grid-cols-2">{operatingAreas.map(([title, body], index) => <div key={title} className="flex gap-5 border-t border-cyan-100/10 pt-5"><span className="font-mono text-xs text-cyan-300/70">0{index + 1}</span><div><h3 className="text-lg font-medium text-stone-100">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></div></div>)}</div>
        </section>

        <section className="py-14 sm:py-20" aria-labelledby="perspective-title"><div className="rounded-2xl border border-cyan-200/15 bg-[linear-gradient(120deg,rgba(10,45,49,0.9),rgba(5,22,28,0.95))] px-7 py-10 sm:px-12 sm:py-14"><p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300/75">Our perspective</p><h2 id="perspective-title" className="mt-5 max-w-3xl text-3xl font-medium leading-tight tracking-[-0.04em] text-stone-50 sm:text-5xl">Digital commerce is most valuable when it makes knowledge easier to access, understand, and apply.</h2></div></section>

        <footer className="flex flex-col gap-3 border-t border-cyan-100/10 py-7 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-xs">
          <span>The Minex · Global information products</span>
          <a className="transition-colors hover:text-cyan-200" href="https://m.yelp.com/biz/mainex-international-miami" target="_blank" rel="noreferrer">8249 NW 66th St, Miami, FL 33166, USA</a>
        </footer>
      </article>
    </main>
  );
}
