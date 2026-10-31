import type { DigestRow } from './types.js';

export function countByStatus(rows: DigestRow[]): { ok: number; retry: number; fail: number } {
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) counts[row.lastStatus]++;
  return counts;
}
