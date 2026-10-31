// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  /** Owner on the job's last line. `null` stays `null`; views show it as `—`. */
  owner: string | null;
  /** Lines for this job. */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  /** Status of the job's last line. */
  lastStatus: RunStatus;
  /** Most recent `error` seen for this job, or `null` if none. */
  lastError: string | null;
  /** `at` of the job's first and last line, as written in the log (offset kept). */
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  /** Sorted by job. Empty when the file has no runs. */
  rows: DigestRow[];
  /** Lines that did not parse. Counted, never thrown. */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl`. Returns `null` when there is no file for that night
 * (or `night` is not `YYYY-MM-DD`), so routes can answer 404.
 * Implemented in `src/digest/read.ts` as `export const readNight: ReadNight`.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
