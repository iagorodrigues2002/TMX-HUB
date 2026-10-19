import type { Browser, BrowserContext, LaunchOptions } from 'playwright';
import { prepareMediaProcess } from '../fetch/media-process.js';
import { guardBrowserContext } from './public-network.js';

type ChromiumLauncher = {
  launch: (opts?: LaunchOptions) => Promise<Browser>;
};

let sharedBrowser: Browser | null = null;
let launching: Promise<Browser> | null = null;
let closePrepared: (() => Promise<void>) | null = null;

export interface BrowserPoolOptions {
  headless?: boolean;
  args?: string[];
}

export async function getBrowser(opts: BrowserPoolOptions = {}): Promise<Browser> {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
  if (launching) return launching;
  launching = launchChromium(opts)
    .then((b) => {
      sharedBrowser = b;
      return b;
    })
    .finally(() => {
      launching = null;
    });
  return launching;
}

export async function disposeBrowser(): Promise<void> {
  await launching?.catch(() => undefined);
  const b = sharedBrowser;
  const cleanup = closePrepared;
  sharedBrowser = null;
  closePrepared = null;
  if (b) {
    try {
      await b.close();
    } catch {
      // ignore
    }
  }
  await cleanup?.();
}

export async function withContext<T>(
  contextOptions: Parameters<Browser['newContext']>[0],
  fn: (ctx: BrowserContext) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
  try {
    await guardBrowserContext(ctx);
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
  const playwright = await import('playwright');
  const prepared = await prepareMediaProcess({
    executable: process.env.TMX_CHROMIUM_EXECUTABLE || playwright.chromium.executablePath(),
    mode: 'public',
  });
  let closing: Promise<void> | undefined;
  const cleanup = () => {
    closing ??= prepared.close();
    return closing;
  };
  const launchOpts: LaunchOptions = {
    headless: opts.headless !== false,
    executablePath: prepared.executablePath,
    env: prepared.env,
    args: [
      ...(opts.args ?? []),
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-quic',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      `--proxy-server=${prepared.proxyUrl}`,
      '--proxy-bypass-list=<-loopback>',
    ],
  };
  try {
    let browser: Browser;
    try {
      const stealthMod = await import('puppeteer-extra-plugin-stealth');
      const playwrightExtraMod = await import('playwright-extra');
      const stealthFactory = (stealthMod as { default?: () => unknown }).default ?? stealthMod;
      const playwrightExtra = playwrightExtraMod as unknown as {
        chromium: ChromiumLauncher & { use: (plugin: unknown) => void };
      };
      const stealthPlugin =
        typeof stealthFactory === 'function' ? (stealthFactory as () => unknown)() : stealthFactory;
      playwrightExtra.chromium.use(stealthPlugin);
      browser = await playwrightExtra.chromium.launch(launchOpts);
    } catch {
      browser = await playwright.chromium.launch(launchOpts);
    }
    closePrepared = cleanup;
    browser.once('disconnected', () => {
      if (sharedBrowser === browser) sharedBrowser = null;
      if (closePrepared === cleanup) closePrepared = null;
      void cleanup().catch(() => undefined);
    });
    return browser;
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}
