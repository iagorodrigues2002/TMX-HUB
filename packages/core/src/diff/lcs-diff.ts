/**
 * Line-level diff using a classic LCS-based algorithm. No external dep,
 * good enough for the page-diff use case where we have at most a few
 * thousand lines per side.
 */

export type DiffOp = 'equal' | 'add' | 'remove';

export interface DiffEntry {
  op: DiffOp;
  /** The line text (always the new value for 'add' and 'equal', old for 'remove'). */
  text: string;
}

export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
}

export interface DiffResult {
  entries: DiffEntry[];
  summary: DiffSummary;
}

function computeLcsLengths(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  // Each row is m+1 long; pre-allocate to avoid Array.from overhead.
  const dp: number[][] = new Array(n + 1);
  for (let i = 0; i <= n; i += 1) {
    dp[i] = new Array(m + 1).fill(0);
  }
  for (let i = 1; i <= n; i += 1) {
    const ai = a[i - 1];
    const row = dp[i] as number[];
    const prev = dp[i - 1] as number[];
    for (let j = 1; j <= m; j += 1) {
      if (ai === b[j - 1]) {
        row[j] = (prev[j - 1] ?? 0) + 1;
      } else {
        const left = row[j - 1] ?? 0;
        const up = prev[j] ?? 0;
        row[j] = left > up ? left : up;
      }
    }
  }
  return dp;
}

export function diffLines(oldLines: string[], newLines: string[]): DiffResult {
  // Fast paths.
  if (oldLines.length === 0 && newLines.length === 0) {
    return { entries: [], summary: { added: 0, removed: 0, unchanged: 0 } };
  }
  // Cap to avoid O(n*m) blowups on huge documents — both sides truncated to
  // 10k lines, more than enough for any reasonable landing page.
  const MAX = 10_000;
  const a = oldLines.slice(0, MAX);
  const b = newLines.slice(0, MAX);

  const dp = computeLcsLengths(a, b);
  const entries: DiffEntry[] = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  // Walk back through the DP matrix to reconstruct the diff.
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      entries.push({ op: 'equal', text: a[i - 1] ?? '' });
      unchanged += 1;
      i -= 1;
      j -= 1;
    } else {
      const up = dp[i - 1]?.[j] ?? 0;
      const left = dp[i]?.[j - 1] ?? 0;
      if (up >= left) {
        entries.push({ op: 'remove', text: a[i - 1] ?? '' });
        removed += 1;
        i -= 1;
      } else {
        entries.push({ op: 'add', text: b[j - 1] ?? '' });
        added += 1;
        j -= 1;
      }
    }
  }
  while (i > 0) {
    entries.push({ op: 'remove', text: a[i - 1] ?? '' });
    removed += 1;
    i -= 1;
  }
  while (j > 0) {
    entries.push({ op: 'add', text: b[j - 1] ?? '' });
    added += 1;
    j -= 1;
  }
  entries.reverse();
  return { entries, summary: { added, removed, unchanged } };
}
