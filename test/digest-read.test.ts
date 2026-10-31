import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('builds one row per job', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const job = (j: string) => rows.find((r) => r.job === j)!;
    expect(job('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(job('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(job('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
    expect(job('digest/render')).toMatchObject({ owner: null, lastError: null, runs: 1 });
    expect(job('lane/sync').firstAt).toBe('2026-10-28T23:00:06+01:00');
  });

  it('returns null for a night with no file or a bad night name', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });

  it('counts lines that do not parse or have the wrong shape, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    const lines = [
      '{"at":"2026-11-01T23:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      'not json',
      '{"at":"2026-11-01T23:01:00+01:00","job":"a","status":"maybe","owner":"rook"}',
      '[]',
      '{"at":"2026-11-01T23:02:00+01:00","job":"b","status":"fail"}',
    ];
    writeFileSync(join(dir, '2026-11-01.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-11-01')!;
    expect(night.badLines).toBe(3);
    expect(night.rows.map((r) => [r.job, r.owner, r.lastStatus])).toEqual([
      ['a', 'rook', 'ok'],
      ['b', null, 'fail'],
    ]);
  });
});
