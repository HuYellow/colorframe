import { colord } from 'colord';
import type { ColorTheme } from '../types';

export type RgbTuple = [number, number, number];

export function normalizeRgbTuple(rgb: RgbTuple): string {
  return colord({ r: rgb[0], g: rgb[1], b: rgb[2] }).toHex();
}

export function chooseReadableTextColor(frameColor: string): string {
  return colord(frameColor).isLight() ? '#15110b' : '#fffaf1';
}

export function createThemeFromPalette(dominantColor: string, palette: string[] = []): ColorTheme {
  const dominant = colord(dominantColor).toHex();
  const normalizedPalette = [dominant, ...palette.map((color) => colord(color).toHex())].filter(
    (color, index, colors) => colors.indexOf(color) === index,
  );

  return {
    dominantColor: dominant,
    frameColor: dominant,
    textColor: chooseReadableTextColor(dominant),
    surfaceColor: colord(dominant).isLight()
      ? colord(dominant).darken(0.08).toHex()
      : colord(dominant).lighten(0.1).toHex(),
    palette: normalizedPalette.slice(0, 6),
  };
}

export function createThemeWithFrameColor(
  dominantColor: string,
  palette: string[] = [],
  selectedFrameColor?: string,
): ColorTheme {
  const theme = createThemeFromPalette(dominantColor, palette);
  const frameColor = selectedFrameColor ? colord(selectedFrameColor).toHex() : theme.frameColor;

  return {
    ...theme,
    frameColor,
    textColor: chooseReadableTextColor(frameColor),
    surfaceColor: colord(frameColor).isLight()
      ? colord(frameColor).darken(0.08).toHex()
      : colord(frameColor).lighten(0.1).toHex(),
  };
}

export function getFallbackTheme(): ColorTheme {
  return createThemeFromPalette('#7d6a55', ['#f2e5cf', '#1f2d2b']);
}
