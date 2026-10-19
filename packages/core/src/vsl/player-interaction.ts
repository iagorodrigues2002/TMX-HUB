import type { Frame, Page } from 'playwright';

export async function humanize(page: Page, log: (s: string) => void): Promise<void> {
  try {
    await page.mouse.move(120, 200, { steps: 8 });
    await page.waitForTimeout(350);
    await page.mouse.move(540, 380, { steps: 12 });
    await page.waitForTimeout(450);
    await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(300);
    log('humanized: mouse + scroll');
  } catch (err) {
    log(`humanize skipped: ${(err as Error).message}`);
  }
}

const PLAY_SELECTORS = [
  '.vjs-big-play-button',
  '.vjs-play-control',
  'button[aria-label*="play" i]',
  'button[title*="play" i]',
  '[role="button"][aria-label*="play" i]',
  '.smartplayer-poster',
  '.true-play-button',
  '.smartplayer-icon-play',
  '.vsl-play-overlay',
  '.play-button',
  '.player-button',
  '[data-testid="play-button"]',
  // VTURB / converteai
  '.true-play-svg',
  // Wistia
  '.w-big-play-button',
  // Panda
  '.panda-poster',
  '.panda-button-play',
  // JW
  '.jw-display-icon-display',
];

async function clickPlayInFrame(frame: Frame, log: (s: string) => void): Promise<boolean> {
  for (const sel of PLAY_SELECTORS) {
    try {
      const el = await frame.$(sel);
      if (!el) continue;
      await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
      // force:true bypasses overlapping overlays (privacy banners, etc.)
      await el.click({ delay: 80, force: true, timeout: 4000 }).catch(() => undefined);
      log(`clicked candidate ${sel} in frame ${frame.url()}`);
      return true;
    } catch {
      // try next
    }
  }
  // Fallback: click center of the largest visual rect (likely the player)
  try {
    const box = await frame.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(
          'video, [class*=player i], [id*=player i], [class*=poster i]',
        ),
      );
      let best: { x: number; y: number; w: number; h: number } | null = null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 100) continue;
        if (!best || r.width * r.height > best.w * best.h) {
          best = { x: r.left, y: r.top, w: r.width, h: r.height };
        }
      }
      return best;
    });
    if (box) {
      // For child frames, scroll/click via JS — we don't have absolute coords
      // for cross-origin frames from the parent page's mouse.
      await frame.evaluate(
        ({ x, y }) => {
          const target = document.elementFromPoint(x, y) as HTMLElement | null;
          target?.click?.();
        },
        { x: box.x + box.w / 2, y: box.y + box.h / 2 },
      );
      log(`js-clicked center of ${box.w}x${box.h} player in frame ${frame.url()}`);
      return true;
    }
  } catch (err) {
    log(`fallback click failed in frame ${frame.url()}: ${(err as Error).message}`);
  }
  return false;
}

export async function attemptVideoStart(page: Page, log: (s: string) => void): Promise<void> {
  // Try to click play in EVERY frame (the VTURB-style player iframe is what
  // matters in most VSL pages). We try the main frame first, then iframes.
  const frames = page.frames();
  log(`page has ${frames.length} frame(s)`);
  for (const frame of frames) {
    await clickPlayInFrame(frame, log);
  }
}
