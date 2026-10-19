import { constants } from 'node:fs';
import { access, open, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { startPublicEgressProxy } from './egress-proxy.js';

const runtimeRoots = [
  '/usr',
  '/bin',
  '/lib',
  '/lib64',
  '/ms-playwright',
  dirname(process.execPath),
];
const beneath = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

async function executablePath(command: string): Promise<string> {
  const candidates = isAbsolute(command)
    ? [command]
    : ['/usr/bin', '/usr/local/bin', '/bin'].map((dir) => join(dir, command));
  for (const candidate of candidates) {
    const resolved = await realpath(candidate).catch(() => '');
    if (!runtimeRoots.some((root) => beneath(root, resolved))) continue;
    if (!(await stat(resolved)).isFile()) continue;
    await access(resolved, constants.X_OK);
    return resolved;
  }
  throw new Error('Executable is outside the media runtime.');
}

/** URL/file validation and a public proxy, not an OS filesystem/network sandbox. */
export async function prepareMediaProcess(options: {
  executable: string;
  mode: 'public' | 'local';
  inputFiles?: string[];
  outputFiles?: string[];
}): Promise<{
  executablePath: string;
  env: Record<string, string>;
  proxyUrl: string;
  close: () => Promise<void>;
}> {
  let proxy: Awaited<ReturnType<typeof startPublicEgressProxy>> | undefined;
  const createdOutputs: string[] = [];
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= Promise.resolve().then(() => proxy?.close());
    return closing;
  };
  try {
    const executable = await executablePath(options.executable);
    const temporaryRoot = await realpath(tmpdir());
    for (const input of options.inputFiles ?? []) {
      const resolved = await realpath(input);
      if (
        !isAbsolute(input) ||
        !beneath(temporaryRoot, resolved) ||
        !(await stat(resolved)).isFile()
      )
        throw new Error('Media input must be a temporary regular file.');
    }
    for (const output of options.outputFiles ?? []) {
      const parent = await realpath(dirname(output));
      const resolved = join(parent, basename(output));
      if (!beneath(temporaryRoot, resolved) || !isAbsolute(output))
        throw new Error('Media output must be a new temporary file.');
      const handle = await open(resolved, 'wx', 0o600);
      await handle.close();
      createdOutputs.push(resolved);
    }
    if (options.mode === 'public') proxy = await startPublicEgressProxy({ tcp: true });
    const proxyUrl = proxy?.proxyUrl ?? '';
    return {
      executablePath: executable,
      proxyUrl,
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: tmpdir(),
        TMPDIR: tmpdir(),
        LANG: 'C.UTF-8',
        ...(proxyUrl ? { http_proxy: proxyUrl, https_proxy: proxyUrl } : {}),
      },
      close,
    };
  } catch (cause) {
    await close().catch(() => undefined);
    await Promise.all(createdOutputs.map((path) => rm(path, { force: true })));
    throw Object.assign(new Error('Media process preparation failed.', { cause }), {
      code: 'media_process_unavailable',
    });
  }
}
