import { describe, expect, it } from 'vitest';
import { buildOutputFileName } from '../utils/export';

describe('export utilities', () => {
  it('adds colorframe suffix and de-duplicates names', () => {
    const used = new Set<string>();

    expect(buildOutputFileName('IMG_001.JPG', 'png', used)).toBe('IMG_001_colorframe.png');
    expect(buildOutputFileName('IMG_001.JPG', 'png', used)).toBe('IMG_001_colorframe-2.png');
  });

});
