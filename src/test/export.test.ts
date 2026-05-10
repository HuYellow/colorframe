import { describe, expect, it } from 'vitest';
import { buildOutputFileName, getMobileExportMode } from '../utils/export';

describe('export utilities', () => {
  it('adds colorframe suffix and de-duplicates names', () => {
    const used = new Set<string>();

    expect(buildOutputFileName('IMG_001.JPG', 'png', used)).toBe('IMG_001_colorframe.png');
    expect(buildOutputFileName('IMG_001.JPG', 'png', used)).toBe('IMG_001_colorframe-2.png');
  });

  it('prefers mobile share for small supported batches', () => {
    expect(getMobileExportMode({ count: 1, canShareFiles: true })).toBe('share');
    expect(getMobileExportMode({ count: 5, canShareFiles: true })).toBe('share');
  });

  it('falls back to zip for larger mobile batches or unsupported share', () => {
    expect(getMobileExportMode({ count: 10, canShareFiles: true })).toBe('zip');
    expect(getMobileExportMode({ count: 3, canShareFiles: false })).toBe('download');
  });
});
