import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  preparation: vi.fn(),
  launch: vi.fn(),
  close: vi.fn(),
  dispose: vi.fn(),
  connected: vi.fn(() => true),
  on: vi.fn(),
}));
vi.mock('../src/fetch/media-process.js', () => ({ prepareMediaProcess: mocks.preparation }));
vi.mock('playwright', () => ({
  chromium: {
    executablePath: () => '/ms-playwright/chromium/chrome',
    launch: mocks.launch,
  },
}));
vi.mock('playwright-extra', () => ({ chromium: { use: vi.fn(), launch: mocks.launch } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({}) }));

describe('Chromium public proxy configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.close.mockResolvedValue(undefined);
    mocks.dispose.mockResolvedValue(undefined);
    mocks.connected.mockReturnValue(true);
    mocks.preparation.mockResolvedValue({
      executablePath: '/usr/bin/chromium',
      env: { PATH: '/usr/bin' },
      proxyUrl: 'http://127.0.0.1:45678',
      close: mocks.close,
    });
    mocks.launch.mockResolvedValue({
      isConnected: mocks.connected,
      close: mocks.dispose,
      once: mocks.on,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('prepares the browser and enforces the proxy after caller flags', async () => {
    const { getBrowser, disposeBrowser } = await import('../src/fetch/browser-pool.js');
    await getBrowser({ args: ['--proxy-server=http://unsafe:1'] });
    expect(mocks.preparation).toHaveBeenCalledWith({
      executable: '/ms-playwright/chromium/chrome',
      mode: 'public',
    });
    const options = mocks.launch.mock.calls[0]![0];
    expect(options.executablePath).toBe('/usr/bin/chromium');
    expect(options.env).toEqual({ PATH: '/usr/bin' });
    expect(options.args.at(-2)).toBe('--proxy-server=http://127.0.0.1:45678');
    expect(options.args.at(-1)).toBe('--proxy-bypass-list=<-loopback>');
    await disposeBrowser();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('never launches without a preparation and retries after an availability failure', async () => {
    mocks.preparation.mockRejectedValueOnce(new Error('media_process_unavailable'));
    const { getBrowser, disposeBrowser } = await import('../src/fetch/browser-pool.js');
    await expect(getBrowser()).rejects.toThrow('media_process_unavailable');
    expect(mocks.launch).not.toHaveBeenCalled();
    await getBrowser();
    expect(mocks.launch).toHaveBeenCalledOnce();
    await disposeBrowser();
  });

  it('keeps both stealth and plain launches configured and cleans up on failure', async () => {
    mocks.launch.mockRejectedValue(new Error('browser failed'));
    const { getBrowser } = await import('../src/fetch/browser-pool.js');
    await expect(getBrowser()).rejects.toThrow('browser failed');
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.launch.mock.calls)
      expect(options.executablePath).toBe('/usr/bin/chromium');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
