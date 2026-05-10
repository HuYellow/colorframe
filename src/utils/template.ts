import type { FrameTemplate } from '../types';

export function createDefaultTemplate(): FrameTemplate {
  return {
    frameRatio: 0.07,
    cornerRadiusRatio: 0.025,
    frameStyle: 'blur',
    textMode: 'filename',
    customText: '',
    textPosition: 'bottom',
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

  return stripExtension(fileName);
}

export function getMimeType(format: FrameTemplate['exportFormat']): string {
  const mimeTypes = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  } satisfies Record<FrameTemplate['exportFormat'], string>;

  return mimeTypes[format];
}
