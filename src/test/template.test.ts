import { describe, expect, it } from 'vitest';
import { createDefaultTemplate, getTemplateText } from '../utils/template';

describe('template utilities', () => {
  it('uses unified placeholder text by default', () => {
    const template = createDefaultTemplate();

    expect(template.textMode).toBe('custom');
    expect(template.customText).toBe('请输入文本');
    expect(template.frameLayout).toBe('stacked');
    expect(template.frameStyle).toBe('solid');
    expect(template.topBlockRatio).toBe(7 / 9);
    expect(template.chineseFont).toBe('zhuque-fangsong');
    expect(template.englishFont).toBe('isenheim');
    expect(template.chineseFontSize).toBe(30);
    expect(template.englishFontSize).toBe(30);
    expect(getTemplateText(template, 'Summer Trip.JPG')).toBe('请输入文本');
  });

  it('uses custom text when selected', () => {
    const template = { ...createDefaultTemplate(), textMode: 'custom' as const, customText: 'Shanghai' };

    expect(getTemplateText(template, 'IMG_001.png')).toBe('Shanghai');
  });

  it('uses per-photo text before template text', () => {
    const template = { ...createDefaultTemplate(), textMode: 'custom' as const, customText: 'Batch title' };

    expect(getTemplateText(template, 'IMG_001.png', 'Photo title')).toBe('Photo title');
  });

  it('uses smart suggested text when smart mode is selected', () => {
    const template = { ...createDefaultTemplate(), textMode: 'smart' as const };

    expect(getTemplateText(template, 'IMG_001.png', undefined, '在路上的一刻')).toBe('在路上的一刻');
  });

  it('lets per-photo text override smart suggested text', () => {
    const template = { ...createDefaultTemplate(), textMode: 'smart' as const };

    expect(getTemplateText(template, 'IMG_001.png', '手写文字', '在路上的一刻')).toBe('手写文字');
  });

  it('falls back to filename when smart suggested text is empty', () => {
    const template = { ...createDefaultTemplate(), textMode: 'smart' as const };

    expect(getTemplateText(template, 'Summer Trip.JPG', undefined, '')).toBe('Summer Trip');
  });

  it('hides text when text mode is none', () => {
    const template = { ...createDefaultTemplate(), textMode: 'none' as const };

    expect(getTemplateText(template, 'IMG_001.png')).toBe('');
  });

  it('does not expose filename text as a selectable template mode', () => {
    const template = { ...createDefaultTemplate(), textMode: 'custom' as const, customText: '' };

    expect(getTemplateText(template, 'IMG_001.png')).toBe('');
  });
});
