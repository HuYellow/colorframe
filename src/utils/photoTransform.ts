import type { PhotoTransform } from '../types';

export const PHOTO_SCALE_MIN = 0.5;
export const PHOTO_SCALE_MAX = 2;
export const PHOTO_OFFSET_MIN = -100;
export const PHOTO_OFFSET_MAX = 100;

export function createDefaultPhotoTransform(): PhotoTransform {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

export function normalizePhotoTransform(transform?: Partial<PhotoTransform>): PhotoTransform {
  return {
    scale: clamp(transform?.scale ?? 1, PHOTO_SCALE_MIN, PHOTO_SCALE_MAX),
    offsetX: clamp(transform?.offsetX ?? 0, PHOTO_OFFSET_MIN, PHOTO_OFFSET_MAX),
    offsetY: clamp(transform?.offsetY ?? 0, PHOTO_OFFSET_MIN, PHOTO_OFFSET_MAX),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
