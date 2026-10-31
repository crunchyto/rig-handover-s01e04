import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: ReadonlySet<string> = new Set<RunStatus>(['ok', 'retry', 'fail']);

// Parse at the edge: anything that is not a well-formed run line is a bad line.
export function parseLine(text: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || Number.isNaN(Date.parse(o.at))) return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (typeof o.status !== 'string' || !STATUSES.has(o.status)) return null;
  if (o.owner !== undefined && o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const line: RunLine = { at: o.at, job: o.job, status: o.status as RunStatus, owner: o.owner ?? null };
  if (o.error !== undefined) line.error = o.error;
  return line;
}

export function digest(night: string, text: string): Night {
  let badLines = 0;
  const byJob = new Map<string, RunLine[]>();
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    const list = byJob.get(line.job) ?? [];
    list.push(line);
    byJob.set(line.job, list);
  }

  const rows: DigestRow[] = [...byJob.entries()].map(([job, lines]) => {
    // Stable sort by time; file order breaks ties.
    const sorted = lines
      .map((l, i) => ({ l, i, t: Date.parse(l.at) }))
      .sort((a, b) => a.t - b.t || a.i - b.i)
      .map((x) => x.l);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const lastWithError = [...sorted].reverse().find((l) => l.error !== undefined);
    return {
      job,
      owner: last.owner,
      runs: sorted.length,
      retries: sorted.filter((l) => l.status === 'retry').length,
      lastStatus: last.status,
      lastError: lastWithError?.error ?? null,
      firstAt: first.at,
      lastAt: last.at,
    };
  });
  rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;
  return digest(night, readFileSync(file, 'utf8'));
};
