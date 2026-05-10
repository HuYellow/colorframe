import type { ColorTheme, FrameTemplate, PhotoTransform, RenderResult, SmartAnalysis } from '../types';
import { normalizePhotoTransform } from './photoTransform';
import { getMimeType, getTemplateText } from './template';

const PREVIEW_MAX_SIDE = 1600;
const EXPORT_MAX_SIDE = 3000;
const MIN_TEXT_FONT_SIZE = 12;

export async function renderFramedImage({
  file,
  template,
  theme,
  mode,
  photoText,
  photoTransform,
  smartAnalysis,
  suggestedText,
}: {
  file: File;
  template: FrameTemplate;
  theme: ColorTheme;
  mode: 'preview' | 'export';
  photoText?: string;
  photoTransform?: PhotoTransform;
  smartAnalysis?: SmartAnalysis;
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
    const layout = computeCanvasLayout({ imageWidth, imageHeight, frame, template });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 不可用');
    }

    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    if (template.frameLayout === 'stacked') {
      context.fillStyle = theme.frameColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      drawFrameBackground(context, image, canvas, theme, template.frameStyle);
    }
    drawRoundedImage(
      context,
      image,
      layout.photoX,
      layout.photoY,
      layout.photoWidth,
      layout.photoHeight,
      template.frameLayout === 'stacked' ? 0 : Math.round(shortSide * template.cornerRadiusRatio),
      photoTransform,
    );
    drawText(context, template, theme, file.name, layout, frame, photoText, suggestedText, smartAnalysis);

    const blob = await canvasToBlob(canvas, getMimeType(template.exportFormat), template.exportQuality);
    const previewUrl = URL.createObjectURL(blob);

    return { blob, previewUrl, theme };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export type CanvasLayout = {
  canvasWidth: number;
  canvasHeight: number;
  photoX: number;
  photoY: number;
  photoWidth: number;
  photoHeight: number;
  textAreaX: number;
  textAreaY: number;
  textAreaWidth: number;
  textAreaHeight: number;
};

export type SmartAnalysisLayout = {
  textX: number;
  titleY: number;
  subtitleY?: number;
  detailsY: number;
  maxTextWidth: number;
};

export function computeSmartAnalysisLayout({
  areaX,
  areaY,
  areaWidth,
  areaHeight,
  hasSubtitle = true,
}: {
  areaX: number;
  areaY: number;
  areaWidth: number;
  areaHeight: number;
  hasSubtitle?: boolean;
}): SmartAnalysisLayout {
  const maxTextWidth = Math.round(areaWidth * 0.42);
  const textX = Math.round(areaX + (areaWidth - maxTextWidth) / 2);
  const titleY = Math.round(areaY + areaHeight * 0.375);
  const subtitleY = hasSubtitle ? Math.round(areaY + areaHeight * 0.508) : undefined;
  const detailsY = Math.round(areaY + areaHeight * (hasSubtitle ? 0.642 : 0.525));

  return { textX, titleY, subtitleY, detailsY, maxTextWidth };
}

export function computeCanvasLayout({
  imageWidth,
  imageHeight,
  frame,
  template,
}: {
  imageWidth: number;
  imageHeight: number;
  frame: number;
  template: FrameTemplate;
}): CanvasLayout {
  if (template.frameLayout === 'stacked') {
    const topBlockHeight = Math.max(1, Math.round(imageHeight * template.topBlockRatio));

    return {
      canvasWidth: imageWidth,
      canvasHeight: imageHeight + topBlockHeight,
      photoX: 0,
      photoY: topBlockHeight,
      photoWidth: imageWidth,
      photoHeight: imageHeight,
      textAreaX: 0,
      textAreaY: 0,
      textAreaWidth: imageWidth,
      textAreaHeight: topBlockHeight,
    };
  }

  return {
    canvasWidth: imageWidth + frame * 2,
    canvasHeight: imageHeight + frame * 2,
    photoX: frame,
    photoY: frame,
    photoWidth: imageWidth,
    photoHeight: imageHeight,
    textAreaX: frame * 0.8,
    textAreaY: template.textPosition === 'top' ? 0 : imageHeight + frame,
    textAreaWidth: imageWidth + frame * 0.4,
    textAreaHeight: frame,
  };
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
  transform?: PhotoTransform,
) {
  const drawRect = computePhotoDrawRect({
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    targetWidth: width,
    targetHeight: height,
    transform,
  });

  if (radius <= 0) {
    context.drawImage(image, x + drawRect.x, y + drawRect.y, drawRect.width, drawRect.height);
    return;
  }

  context.save();
  roundedRectPath(context, x, y, width, height, radius);
  context.clip();
  context.drawImage(image, x + drawRect.x, y + drawRect.y, drawRect.width, drawRect.height);
  context.restore();
}

export function computePhotoDrawRect({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  transform,
}: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  transform?: Partial<PhotoTransform>;
}) {
  const normalizedTransform = normalizePhotoTransform(transform);
  const coverScale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = Math.round(sourceWidth * coverScale * normalizedTransform.scale);
  const height = Math.round(sourceHeight * coverScale * normalizedTransform.scale);
  const centerX = (targetWidth - width) / 2;
  const centerY = (targetHeight - height) / 2;

  return {
    x: Math.round(centerX + getOffsetPixels(normalizedTransform.offsetX, width, targetWidth)),
    y: Math.round(centerY + getOffsetPixels(normalizedTransform.offsetY, height, targetHeight)),
    width,
    height,
  };
}

function getOffsetPixels(offset: number, drawSize: number, targetSize: number): number {
  const maxOffset = drawSize > targetSize ? (drawSize - targetSize) / 2 : drawSize < targetSize ? drawSize : 0;

  return (offset / 100) * maxOffset;
}

function drawText(
  context: CanvasRenderingContext2D,
  template: FrameTemplate,
  theme: ColorTheme,
  fileName: string,
  layout: CanvasLayout,
  frame: number,
  photoText?: string,
  suggestedText?: string,
  smartAnalysis?: SmartAnalysis,
) {
  const renderMode = computeTextRenderMode({ template, fileName, photoText, suggestedText, smartAnalysis });
  if (renderMode.kind === 'none') {
    return;
  }

  if (renderMode.kind === 'smartAnalysis') {
    drawSmartAnalysis(context, theme, layout, renderMode.analysis);
    return;
  }

  const lines = normalizeManualTextLines(renderMode.text);
  if (!lines.length) {
    return;
  }

  const textPadding = template.frameLayout === 'stacked' ? Math.max(20, layout.textAreaWidth * 0.12) : frame * 0.2;
  const maxWidth = Math.max(1, layout.textAreaWidth - textPadding * 2);
  const maxHeight = Math.max(1, layout.textAreaHeight * 0.72);
  const initialFontSize =
    template.frameLayout === 'stacked'
      ? Math.max(18, Math.min(72, Math.round(layout.textAreaHeight * 0.16)))
      : Math.max(18, Math.min(54, Math.round(frame * 0.36)));
  const textLayout = layoutTextLines(context, lines, {
    centerX: layout.textAreaX + layout.textAreaWidth / 2,
    centerY: layout.textAreaY + layout.textAreaHeight / 2,
    maxWidth,
    maxHeight,
    initialFontSize,
  });

  context.save();
  context.fillStyle = theme.textColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = getTextFont(textLayout.fontSize);
  textLayout.lines.forEach((line) => context.fillText(line.text, line.x, line.y, maxWidth));
  context.restore();
}

export type TextRenderMode =
  | { kind: 'none' }
  | { kind: 'plainText'; text: string }
  | { kind: 'smartAnalysis'; analysis: SmartAnalysis };

export function computeTextRenderMode({
  template,
  fileName,
  photoText,
  suggestedText,
  smartAnalysis,
}: {
  template: FrameTemplate;
  fileName: string;
  photoText?: string;
  suggestedText?: string;
  smartAnalysis?: SmartAnalysis;
}): TextRenderMode {
  const customPhotoText = photoText?.trim();
  if (customPhotoText) {
    return { kind: 'plainText', text: customPhotoText };
  }

  if (template.textMode === 'smart' && smartAnalysis) {
    return { kind: 'smartAnalysis', analysis: smartAnalysis };
  }

  const text = getTemplateText(template, fileName, photoText, suggestedText);
  return text ? { kind: 'plainText', text } : { kind: 'none' };
}

function drawSmartAnalysis(
  context: CanvasRenderingContext2D,
  theme: ColorTheme,
  layout: CanvasLayout,
  analysis: SmartAnalysis,
) {
  const smartLayout = computeSmartAnalysisLayout({
    areaX: layout.textAreaX,
    areaY: layout.textAreaY,
    areaWidth: layout.textAreaWidth,
    areaHeight: layout.textAreaHeight,
    hasSubtitle: Boolean(analysis.subtitle),
  });
  const titleSize = Math.max(16, Math.min(42, Math.round(layout.textAreaHeight * 0.115)));
  const subtitleSize = Math.max(12, Math.round(titleSize * 0.58));
  const detailSize = Math.max(10, Math.round(titleSize * 0.38));
  const detailLineHeight = Math.round(detailSize * 1.35);

  context.save();
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = theme.textColor;
  context.font = `800 ${titleSize}px "Aptos", "Segoe UI", sans-serif`;
  context.fillText(analysis.title, smartLayout.textX, smartLayout.titleY, smartLayout.maxTextWidth);

  if (analysis.subtitle && smartLayout.subtitleY !== undefined) {
    context.globalAlpha = 0.84;
    context.font = `700 ${subtitleSize}px "Aptos", "Segoe UI", sans-serif`;
    context.fillText(analysis.subtitle, smartLayout.textX, smartLayout.subtitleY, smartLayout.maxTextWidth);
  }

  context.globalAlpha = 0.46;
  context.font = `600 ${detailSize}px "Aptos", "Segoe UI", sans-serif`;
  analysis.detailLines.forEach((line, index) => {
    context.fillText(line, smartLayout.textX, smartLayout.detailsY + index * detailLineHeight, smartLayout.maxTextWidth);
  });
  context.restore();
}

export function normalizeManualTextLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim());

  while (lines[0] === '') {
    lines.shift();
  }

  while (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

export function layoutTextLines(
  context: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  lines: string[],
  {
    centerX,
    centerY,
    maxWidth,
    maxHeight,
    initialFontSize,
  }: {
    centerX: number;
    centerY: number;
    maxWidth: number;
    maxHeight: number;
    initialFontSize: number;
  },
) {
  let fontSize = initialFontSize;

  while (fontSize > MIN_TEXT_FONT_SIZE && !doTextLinesFit(context, lines, fontSize, maxWidth, maxHeight)) {
    fontSize -= 1;
  }

  context.font = getTextFont(fontSize);
  const lineHeight = Math.round(fontSize * 1.34);
  const totalHeight = lineHeight * lines.length;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;

  return {
    fontSize,
    lines: lines.map((line, index) => ({
      text: line,
      x: centerX,
      y: startY + index * lineHeight,
    })),
  };
}

function doTextLinesFit(
  context: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  lines: string[],
  fontSize: number,
  maxWidth: number,
  maxHeight: number,
) {
  context.font = getTextFont(fontSize);
  const lineHeight = Math.round(fontSize * 1.34);
  const totalHeight = lineHeight * lines.length;

  return totalHeight <= maxHeight && lines.every((line) => line === '' || context.measureText(line).width <= maxWidth);
}

function getTextFont(fontSize: number): string {
  return `600 ${fontSize}px "Aptos", "Segoe UI", sans-serif`;
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
