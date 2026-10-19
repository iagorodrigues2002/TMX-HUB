import { describe, expect, it } from 'vitest';
import { prepareMediaProcess } from '../src/fetch/media-process.js';

describe('media process preparation', () => {
  it('does not accept a binary outside the minimal runtime filesystem', async () => {
    await expect(
      prepareMediaProcess({ executable: '/tmp/untrusted', mode: 'local' }),
    ).rejects.toMatchObject({ code: 'media_process_unavailable' });
  });

  it('prepares an executable without requiring Linux namespace privileges', async () => {
    const prepared = await prepareMediaProcess({ executable: process.execPath, mode: 'local' });
    expect(prepared.executablePath).toMatch(/\/node$/);
    expect(prepared.env).not.toHaveProperty('JWT_SECRET');
    await prepared.close();
  });

  it('rejects a directory as an output file before starting a process', async () => {
    await expect(
      prepareMediaProcess({ executable: '/bin/true', mode: 'local', outputFiles: ['/tmp'] }),
    ).rejects.toMatchObject({ code: 'media_process_unavailable' });
  });
});
