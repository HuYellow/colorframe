import { describe, expect, it } from 'vitest';
import { createBatchJobs, summarizeJobs } from '../utils/batch';

function makeFile(name: string, type = 'image/png') {
  return new File(['sample'], name, { type });
}

describe('batch utilities', () => {
  it('creates pending jobs for image files and failed jobs for invalid files', () => {
    const jobs = createBatchJobs([makeFile('a.png'), makeFile('notes.txt', 'text/plain')]);

    expect(jobs[0]).toMatchObject({ originalName: 'a.png', status: 'pending', progress: 0 });
    expect(jobs[1]).toMatchObject({ originalName: 'notes.txt', status: 'failed', progress: 0 });
  });

  it('summarizes batch states', () => {
    const jobs = createBatchJobs([makeFile('a.png'), makeFile('b.png')]);
    jobs[0].status = 'done';
    jobs[1].status = 'failed';

    expect(summarizeJobs(jobs)).toEqual({
      total: 2,
      pending: 0,
      processing: 0,
      done: 1,
      failed: 1,
      cancelled: 0,
    });
  });
});
