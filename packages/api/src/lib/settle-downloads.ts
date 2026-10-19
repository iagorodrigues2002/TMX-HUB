/** Wait for every producer before caller cleanup can start, even on failure. */
export async function settleDownloads<T extends { filePath: string }>(
  jobs: Array<Promise<T>>,
  cleanupPaths: string[],
): Promise<T[]> {
  const settled = await Promise.allSettled(jobs);
  const results = settled.flatMap((result) => {
    if (result.status !== 'fulfilled') return [];
    cleanupPaths.push(result.value.filePath);
    return [result.value];
  });
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return results;
}
