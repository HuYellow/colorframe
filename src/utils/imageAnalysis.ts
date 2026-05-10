import { getColorSync, getPaletteSync } from 'colorthief';
import { FastAverageColor } from 'fast-average-color';
import { createThemeFromPalette, getFallbackTheme } from './color';
import type { ColorTheme } from '../types';

const averageColor = new FastAverageColor();

export async function analyzeImage(file: File): Promise<ColorTheme> {
  const imageUrl = URL.createObjectURL(file);
  const image = await loadImage(imageUrl);

  try {
    const sampleCanvas = createSampleCanvas(image, 360);
    const dominantColor = getColorSync(sampleCanvas, { quality: 10 });
    const paletteColors = getPaletteSync(sampleCanvas, { colorCount: 6, quality: 10 });

    if (!dominantColor) {
      throw new Error('主题色提取失败');
    }

    const dominant = dominantColor.hex();
    const palette = paletteColors?.map((color) => color.hex()) ?? [dominant];

    return createThemeFromPalette(dominant, palette);
  } catch {
    try {
      const result = averageColor.getColor(image);
      return createThemeFromPalette(result.hex, [result.hex]);
    } catch {
      return getFallbackTheme();
    }
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      return loadImage(URL.createObjectURL(file), true);
    }
  }

  return loadImage(URL.createObjectURL(file), true);
}

export function closeDecodedImage(image: ImageBitmap | HTMLImageElement): void {
  if ('close' in image) {
    image.close();
  }
}

function createSampleCanvas(image: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 不可用');
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function loadImage(url: string, revokeOnLoad = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (revokeOnLoad) {
        URL.revokeObjectURL(url);
      }
      resolve(image);
    };
    image.onerror = () => {
      if (revokeOnLoad) {
        URL.revokeObjectURL(url);
      }
      reject(new Error('图片解码失败'));
    };
    image.src = url;
  });
}
