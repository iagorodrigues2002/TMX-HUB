import { PublicSurface } from '@/components/hub/public-surface';
import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'The Minex | Global Digital Commerce',
  description:
    'The Minex is a global digital commerce company creating and operating information products for international audiences.',
};

const principles = [
  [
    '01',
    'Information with purpose',
    'We create and operate information products that turn specialized knowledge into practical, accessible digital experiences.',
  ],
  [
    '02',
    'Global by design',
    'Our digital delivery model lets us serve customers across markets while adapting product journeys to local languages, needs, and contexts.',
  ],
  [
    '03',
    'Built to operate',
    'We bring together product, technology, analytics, and customer operations to build reliable businesses around digital knowledge.',
  ],
];

const operatingAreas = [
  [
    'Product development',
    'From research and content structure to the complete digital product experience.',
  ],
  [
    'International commerce',
    'Localized offers, checkout journeys, and digital delivery for global audiences.',
  ],
  [
    'Performance intelligence',
    'Measurement systems that help us understand product performance across markets.',
  ],
  [
    'Customer experience',
    'Clear information and thoughtful post-purchase journeys throughout the customer lifecycle.',
  ],
];

export default function InfoPage() {
  return (
    <PublicSurface>
      <main className="min-h-screen overflow-hidden bg-background px-4 py-4 text-foreground sm:px-8 sm:py-8">
        <article className="relative z-10 mx-auto max-w-6xl">
          <header className="glass-card relative overflow-hidden">
            <div className="pointer-events-none absolute -right-24 -top-20 hidden h-[34rem] w-[34rem] opacity-15 lg:block">
              <Image
                src="/brand/the-minex-mark.png"
                alt=""
                fill
                sizes="544px"
                className="object-contain"
                priority
              />
            </div>
            <div className="flex items-center justify-between gap-5 border-b border-border px-6 py-5 font-mono text-[10px] uppercase tracking-[0.24em] text-primary sm:px-10 sm:text-xs">
              <span className="flex items-center gap-3">
                <span className="relative -my-3 h-11 w-11 overflow-hidden">
                  <Image
                    src="/brand/the-minex-mark.png"
                    alt="The Minex"
                    fill
                    sizes="44px"
                    className="scale-[1.55] object-contain"
                    priority
                  />
                </span>
                <span>The Minex</span>
              </span>
              <span>Company profile · 2026</span>
            </div>
            <div className="grid gap-12 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-[1.45fr_0.55fr] lg:items-end">
              <div className="relative">
                <div className="absolute -left-6 top-0 h-24 w-px bg-gradient-to-b from-primary to-transparent sm:-left-10" />
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                  Global digital commerce
                </p>
                <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.055em] text-foreground sm:text-7xl">
                  Information products for a world without borders.
                </h1>
                <p className="mt-8 max-w-2xl text-lg leading-8 text-secondary-foreground sm:text-xl">
                  The Minex builds, operates, and scales digital information products for
                  international audiences. We combine useful knowledge with disciplined technology
                  and commerce operations.
                </p>
              </div>
              <div className="glass-card rounded-2xl border border-border bg-background p-6 backdrop-blur-sm sm:p-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Monthly digital commerce volume
                </p>
                <p className="mt-4 text-4xl font-medium tracking-[-0.04em] text-primary sm:text-5xl">
                  US$100K+
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  in monthly sales across our information-product portfolio.
                </p>
              </div>
            </div>
            <div className="grid border-t border-border sm:grid-cols-3">
              <div className="border-b border-border px-6 py-5 sm:border-b-0 sm:border-r sm:px-10">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/75">
                  Focus
                </p>
                <p className="mt-2 text-sm text-secondary-foreground">Information products</p>
              </div>
              <div className="border-b border-border px-6 py-5 sm:border-b-0 sm:border-r sm:px-10">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/75">
                  Operating model
                </p>
                <p className="mt-2 text-sm text-secondary-foreground">Digital-first commerce</p>
              </div>
              <div className="px-6 py-5 sm:px-10">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/75">
                  Reach
                </p>
                <p className="mt-2 text-sm text-secondary-foreground">International audiences</p>
              </div>
            </div>
          </header>

          <section
            className="grid py-20 sm:grid-cols-[0.8fr_1.2fr] sm:gap-20 sm:py-28"
            aria-labelledby="about-title"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">About us</p>
              <h2
                id="about-title"
                className="mt-4 text-3xl font-medium tracking-[-0.035em] text-foreground"
              >
                A company built around useful knowledge.
              </h2>
            </div>
            <div className="mt-7 space-y-5 text-base leading-8 text-secondary-foreground sm:mt-0 sm:text-lg">
              <p>
                We believe information can become a meaningful product when it is clear, relevant,
                and delivered with care. Our work begins with product development and continues
                through every part of the digital commerce experience.
              </p>
              <p>
                From our operating base in Brazil, we serve a growing international customer base
                through digital-first products, localized journeys, and data-informed decision
                making.
              </p>
            </div>
          </section>

          <section
            className="rounded-[1.5rem] border border-border bg-background p-6 sm:p-10"
            aria-labelledby="principles-title"
          >
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
                  What guides us
                </p>
                <h2
                  id="principles-title"
                  className="mt-4 text-3xl font-medium tracking-[-0.035em] text-foreground"
                >
                  The way we build.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                A focused operating model for building durable, international digital products.
              </p>
            </div>
            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {principles.map(([number, title, body]) => (
                <div
                  key={number}
                  className="glass-card min-h-64 rounded-xl border border-border bg-background p-7 transition duration-300 hover:-translate-y-1 hover:border-border hover:bg-background sm:p-8"
                >
                  <p className="font-mono text-xs tracking-[0.2em] text-primary">{number}</p>
                  <h3 className="mt-12 text-2xl font-medium tracking-[-0.03em] text-foreground">
                    {title}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-secondary-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="py-20 sm:py-28" aria-labelledby="operations-title">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
              Operating model
            </p>
            <h2
              id="operations-title"
              className="mt-4 max-w-2xl text-3xl font-medium tracking-[-0.035em] text-foreground"
            >
              From product insight to a complete customer journey.
            </h2>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {operatingAreas.map(([title, body], index) => (
                <div
                  key={title}
                  className="glass-card flex gap-5 rounded-xl border border-border bg-background p-6"
                >
                  <span className="font-mono text-xs text-primary">0{index + 1}</span>
                  <div>
                    <h3 className="text-lg font-medium text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pb-20" aria-labelledby="perspective-title">
            <div className="glass-card relative overflow-hidden px-7 py-12 sm:px-12 sm:py-16">
              <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full border border-border" />
              <div className="pointer-events-none absolute -right-2 top-6 h-40 w-40 rounded-full border border-border" />
              <p className="relative font-mono text-xs uppercase tracking-[0.24em] text-primary">
                Our perspective
              </p>
              <h2
                id="perspective-title"
                className="relative mt-5 max-w-3xl text-3xl font-medium leading-tight tracking-[-0.04em] text-foreground sm:text-5xl"
              >
                Digital commerce is most valuable when it makes knowledge easier to access,
                understand, and apply.
              </h2>
            </div>
          </section>

          <footer className="flex flex-col gap-3 border-t border-border py-7 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/75 sm:flex-row sm:items-center sm:justify-between sm:text-xs">
            <span>The Minex · Global information products</span>
            <a
              className="transition-colors hover:text-primary"
              href="https://m.yelp.com/biz/mainex-international-miami"
              target="_blank"
              rel="noreferrer"
            >
              8249 NW 66th St, Miami, FL 33166, USA
            </a>
          </footer>
        </article>
      </main>
    </PublicSurface>
  );
}
