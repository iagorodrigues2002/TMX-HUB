import type { Browser, BrowserContext, LaunchOptions } from 'playwright';

type ChromiumLauncher = {
  launch: (opts?: LaunchOptions) => Promise<Browser>;
};

let sharedBrowser: Browser | null = null;
let launching: Promise<Browser> | null = null;

export interface BrowserPoolOptions {
  headless?: boolean;
  args?: string[];
}

export async function getBrowser(opts: BrowserPoolOptions = {}): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  if (launching) return launching;
  launching = launchChromium(opts).then((b) => {
    sharedBrowser = b;
    launching = null;
    return b;
  });
  return launching;
}

export async function disposeBrowser(): Promise<void> {
  const b = sharedBrowser;
  sharedBrowser = null;
  if (b) {
    try {
      await b.close();
    } catch {
      // ignore
    }
  }
}

export async function withContext<T>(
  contextOptions: Parameters<Browser['newContext']>[0],
  fn: (ctx: BrowserContext) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  const ctx = await browser.newContext(contextOptions);
  try {
    return await fn(ctx);
  } finally {
    try {
      await ctx.close();
    } catch {
      // ignore
    }
  }
}

async function launchChromium(opts: BrowserPoolOptions): Promise<Browser> {
  const launchOpts: LaunchOptions = {
    headless: opts.headless !== false,
    args: opts.args ?? [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  };
  // Lazy import so the package works without playwright installed.
  try {
    const stealthMod = await import('puppeteer-extra-plugin-stealth');
    const playwrightExtraMod = await import('playwright-extra');
    const stealthFactory =
      (stealthMod as { default?: () => unknown }).default ?? stealthMod;
    const playwrightExtra = playwrightExtraMod as unknown as {
      chromium: ChromiumLauncher & { use: (plugin: unknown) => void };
    };
    const stealthPlugin =
      typeof stealthFactory === 'function'
        ? (stealthFactory as () => unknown)()
        : stealthFactory;
    playwrightExtra.chromium.use(stealthPlugin);
    return await playwrightExtra.chromium.launch(launchOpts);
  } catch {
    const playwright = (await import('playwright')) as unknown as {
      chromium: ChromiumLauncher;
    };
    return await playwright.chromium.launch(launchOpts);
  }
}
