import { describe, expect, it } from 'vitest';
import { buildSmartCaption, cleanCaptionSubject } from '../utils/smartCaption';

describe('smart caption utilities', () => {
  it('cleans noisy filenames into readable subjects', () => {
    expect(cleanCaptionSubject('IMG_20260510_shanghai-trip_001.JPG')).toBe('shanghai trip');
  });

  it('uses a cleaned filename subject when metadata is sparse', () => {
    expect(buildSmartCaption({ fileName: 'sunset_walk.png' })).toBe('把 sunset walk 的颜色留在这一刻');
  });

  it('uses date context when a capture date is available', () => {
    expect(buildSmartCaption({ fileName: 'IMG_001.JPG', takenAt: new Date('2026-05-10T08:30:00') })).toBe(
      '2026 春日的一张照片',
    );
  });

  it('uses a local-only travel caption when gps exists without reverse geocoding', () => {
    expect(buildSmartCaption({ fileName: 'IMG_001.JPG', hasGps: true })).toBe('在路上的一刻');
  });

  it('falls back to a neutral caption when no useful signal exists', () => {
    expect(buildSmartCaption({ fileName: 'IMG_001.JPG' })).toBe('此刻的颜色');
  });
});
