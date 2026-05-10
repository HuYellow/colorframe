import { describe, expect, it } from 'vitest';
import {
  chooseReadableTextColor,
  createThemeFromPalette,
  createThemeWithFrameColor,
  normalizeRgbTuple,
} from '../utils/color';

describe('color utilities', () => {
  it('normalizes RGB tuples to hex strings', () => {
    expect(normalizeRgbTuple([12, 140, 255])).toBe('#0c8cff');
  });

  it('chooses dark text for light frame colors', () => {
    expect(chooseReadableTextColor('#f5dfb6')).toBe('#15110b');
  });

  it('chooses light text for dark frame colors', () => {
    expect(chooseReadableTextColor('#13293d')).toBe('#fffaf1');
  });

  it('creates a complete theme from a dominant color and palette', () => {
    const theme = createThemeFromPalette('#7b4f2c', ['#7b4f2c', '#e6d3b4']);

    expect(theme.frameColor).toBe('#7b4f2c');
    expect(theme.textColor).toBe('#fffaf1');
    expect(theme.palette).toEqual(['#7b4f2c', '#e6d3b4']);
    expect(theme.surfaceColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('can create a theme using a selected palette color as the frame color', () => {
    const theme = createThemeWithFrameColor('#7b4f2c', ['#7b4f2c', '#e6d3b4'], '#e6d3b4');

    expect(theme.dominantColor).toBe('#7b4f2c');
    expect(theme.frameColor).toBe('#e6d3b4');
    expect(theme.textColor).toBe('#15110b');
  });
});
