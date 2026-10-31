import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
const fixture = readFileSync('runs/2026-10-28.jsonl', 'utf8');
writeFileSync(join(runsDir, '2026-10-28.jsonl'), fixture);
writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
writeFileSync(join(runsDir, '2026-10-30.jsonl'), '{bad json}\n');
const app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

describe('digest routes', () => {
  it('renders sorted jobs, missing values and warning rows', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<h1>digest 2026-10-28</h1>');
    expect(html.match(/<table\b/g)).toHaveLength(1);
    const rows = [...html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)];
    const jobRows = rows.filter((row) => jobs.some((job) => row[2]?.includes(job)));
    expect(jobRows).toHaveLength(5);
    expect(jobRows.map((row) => jobs.find((job) => row[2]?.includes(job)))).toEqual(jobs);
    for (const row of jobRows) {
      const warned = row[2]?.includes('fixtures/refresh') || row[2]?.includes('notes/backup');
      expect(row[1]).toMatch(warned ? /class="warn"/ : /^(?!.*class="warn").*$/);
    }
    expect(jobRows[0]?.[2]?.match(/—/g)).toHaveLength(2);
  });

  it('returns the same sorted jobs and complete JSON rows', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const data = await res.json() as Night;
    expect(data.night).toBe('2026-10-28');
    expect(data.rows.map((row) => row.job)).toEqual(jobs);
    expect(data.badLines).toBe(1);
    for (const row of data.rows) {
      expect(Object.keys(row).sort()).toEqual(['job', 'owner', 'runs', 'retries', 'lastStatus', 'lastError', 'firstAt', 'lastAt'].sort());
    }
    expect(data.rows[0]?.owner).toBeNull();
    const html = await (await app.request('/digest/2026-10-28')).text();
    const pageJobs = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((row) => jobs.find((job) => row[1]?.includes(job))).filter(Boolean);
    expect(pageJobs).toEqual(data.rows.map((row) => row.job));
  });

  it('returns 404 for a missing night', async () => {
    expect((await app.request('/digest/2026-10-27')).status).toBe(404);
    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-10-27' });
  });

  it('handles an empty night', async () => {
    const page = await app.request('/digest/2026-10-29');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    const json = await app.request('/api/digest/2026-10-29');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ night: '2026-10-29', rows: [], badLines: 0 });
  });

  it('reports a bad line', async () => {
    const page = await app.request('/digest/2026-10-30');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('bad lines: 1');
    const json = await app.request('/api/digest/2026-10-30');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ night: '2026-10-30', rows: [], badLines: 1 });
  });
});
