import type { FrameTemplate } from '../types';

export function createDefaultTemplate(): FrameTemplate {
  return {
    frameLayout: 'stacked',
    frameRatio: 0.07,
    cornerRadiusRatio: 0.025,
    frameStyle: 'solid',
    topBlockRatio: 7 / 9,
    textMode: 'custom',
    customText: '请输入文本',
    textPosition: 'bottom',
    chineseFont: 'zhuque-fangsong',
    englishFont: 'isenheim',
    chineseFontSize: 14,
    englishFontSize: 14,
    exportFormat: 'png',
    exportQuality: 0.92,
  };
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

export function getTemplateText(
  template: FrameTemplate,
  fileName: string,
  photoText?: string,
  suggestedText?: string,
): string {
  const customPhotoText = photoText?.trim();
  if (customPhotoText) {
    return customPhotoText;
  }

  if (template.textMode === 'none') {
    return '';
  }

  if (template.textMode === 'custom') {
    return template.customText.trim();
  }

  if (template.textMode === 'smart') {
    return suggestedText?.trim() || stripExtension(fileName);
  }

  return '';
}

export function getMimeType(format: FrameTemplate['exportFormat']): string {
  const mimeTypes = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  } satisfies Record<FrameTemplate['exportFormat'], string>;

  return mimeTypes[format];
}
