import { describe, expect, it } from 'vitest';
import { buildSmartAnalysis, buildSmartCaption, cleanCaptionSubject } from '../utils/smartCaption';

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

  it('builds a structured smart analysis layout from photo metadata', () => {
    expect(
      buildSmartAnalysis({
        fileName: '8C Circular Quay W.jpg',
        takenAt: new Date('2026-05-10T14:54:00'),
        camera: 'iPhone XS',
        latitude: -33.8568,
        longitude: 151.2153,
        hasGps: true,
        altitude: 1,
        speed: 2,
        speedRef: 'K',
        direction: 67.5,
        exposureTime: 1 / 1425,
        fNumber: 2.4,
        iso: 16,
        focalLengthIn35mm: 52,
      }),
    ).toEqual({
      title: '8C CIRCULAR QUAY W',
      subtitle: '2:54 PM',
      detailLines: [
        '摄于 iPhone XS 记录这一瞬',
        '拍摄位置 33.8568°S, 151.2153°E · 海拔约 1m · 2公里/小时 穿行',
        '拍摄时正面向 东偏东北',
        '这张照片的相机参数为 F/2.4 · 1/1425s · ISO 16 · 52mm',
      ],
    });
  });

  it('omits missing smart analysis fields instead of showing placeholders', () => {
    expect(buildSmartAnalysis({ fileName: 'quiet-room.jpg' })).toEqual({
      title: 'QUIET ROOM',
      detailLines: [],
    });
  });
});
