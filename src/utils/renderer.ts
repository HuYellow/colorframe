import type { ColorTheme, FrameTemplate, RenderResult } from '../types';
import { getMimeType, getTemplateText } from './template';

const PREVIEW_MAX_SIDE = 1600;
const EXPORT_MAX_SIDE = 3000;

export async function renderFramedImage({
  file,
  template,
  theme,
  mode,
  photoText,
  suggestedText,
}: {
  file: File;
  template: FrameTemplate;
  theme: ColorTheme;
  mode: 'preview' | 'export';
  photoText?: string;
  suggestedText?: string;
}): Promise<RenderResult> {
  const imageUrl = URL.createObjectURL(file);
  const image = await loadImage(imageUrl);

  try {
    const sourceMaxSide = mode === 'preview' ? PREVIEW_MAX_SIDE : EXPORT_MAX_SIDE;
    const sourceScale = Math.min(1, sourceMaxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const imageWidth = Math.max(1, Math.round(image.naturalWidth * sourceScale));
    const imageHeight = Math.max(1, Math.round(image.naturalHeight * sourceScale));
    const shortSide = Math.min(imageWidth, imageHeight);
    const frame = Math.max(24, Math.round(shortSide * template.frameRatio));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 不可用');
    }

    canvas.width = imageWidth + frame * 2;
    canvas.height = imageHeight + frame * 2;

    drawFrameBackground(context, image, canvas, theme, template.frameStyle);
    drawRoundedImage(context, image, frame, frame, imageWidth, imageHeight, Math.round(shortSide * template.cornerRadiusRatio));
    drawText(context, canvas, template, theme, file.name, frame, photoText, suggestedText);

    const blob = await canvasToBlob(canvas, getMimeType(template.exportFormat), template.exportQuality);
    const previewUrl = URL.createObjectURL(blob);

    return { blob, previewUrl, theme };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function drawFrameBackground(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  theme: ColorTheme,
  frameStyle: FrameTemplate['frameStyle'],
) {
  if (frameStyle === 'blur') {
    context.save();
    context.filter = 'blur(28px) saturate(1.18)';
    context.drawImage(image, -canvas.width * 0.08, -canvas.height * 0.08, canvas.width * 1.16, canvas.height * 1.16);
    context.restore();
    context.fillStyle = `${theme.frameColor}88`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  context.fillStyle = theme.frameColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawRoundedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  if (radius <= 0) {
    context.drawImage(image, x, y, width, height);
    return;
  }

  context.save();
  roundedRectPath(context, x, y, width, height, radius);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();
}

function drawText(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  template: FrameTemplate,
  theme: ColorTheme,
  fileName: string,
  frame: number,
  photoText?: string,
  suggestedText?: string,
) {
  const text = getTemplateText(template, fileName, photoText, suggestedText);
  if (!text) {
    return;
  }

  const maxWidth = canvas.width - frame * 1.6;
  const fontSize = Math.max(18, Math.min(54, Math.round(frame * 0.36)));
  const y = template.textPosition === 'top' ? frame * 0.58 : canvas.height - frame * 0.38;

  context.save();
  context.fillStyle = theme.textColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `600 ${fontSize}px "Aptos", "Segoe UI", sans-serif`;
  fitText(context, text, canvas.width / 2, y, maxWidth, fontSize);
  context.restore();
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialFontSize: number,
) {
  let fontSize = initialFontSize;

  while (fontSize > 12 && context.measureText(text).width > maxWidth) {
    fontSize -= 1;
    context.font = `600 ${fontSize}px "Aptos", "Segoe UI", sans-serif`;
  }

  context.fillText(text, x, y, maxWidth);
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('图片导出失败'));
      },
      mimeType,
      quality,
    );
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = url;
  });
}
