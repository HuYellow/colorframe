import { describe, expect, it } from 'vitest';
import { computePhotoDrawRect } from '../utils/renderer';

describe('renderer photo composition', () => {
  it('keeps the default scale as the current cover fit', () => {
    expect(
      computePhotoDrawRect({
        sourceWidth: 400,
        sourceHeight: 200,
        targetWidth: 300,
        targetHeight: 300,
        transform: { scale: 1, offsetX: 0, offsetY: 0 },
      }),
    ).toEqual({ x: -150, y: 0, width: 600, height: 300 });
  });

  it('allows 50% scale to expose the frame background while keeping the image partly visible', () => {
    expect(
      computePhotoDrawRect({
        sourceWidth: 400,
        sourceHeight: 200,
        targetWidth: 300,
        targetHeight: 300,
        transform: { scale: 0.5, offsetX: 100, offsetY: -100 },
      }),
    ).toEqual({ x: 0, y: -75, width: 300, height: 150 });
  });

  it('clamps 200% offsets so enlarged images cannot expose empty space', () => {
    expect(
      computePhotoDrawRect({
        sourceWidth: 400,
        sourceHeight: 200,
        targetWidth: 300,
        targetHeight: 300,
        transform: { scale: 2, offsetX: 100, offsetY: -100 },
      }),
    ).toEqual({ x: 0, y: -300, width: 1200, height: 600 });
  });
});
