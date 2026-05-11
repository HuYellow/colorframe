import { describe, expect, it } from 'vitest';
import {
  computeCanvasLayout,
  ensureCaptionFontReady,
  computeTextRenderMode,
  computePhotoDrawRect,
  computeSmartAnalysisLayout,
  layoutTextLines,
  normalizeManualTextLines,
} from '../utils/renderer';

describe('renderer photo composition', () => {
  it('uses a top color block above the photo for stacked layouts', () => {
    expect(
      computeCanvasLayout({
        imageWidth: 400,
        imageHeight: 300,
        frame: 40,
        template: {
          frameLayout: 'stacked',
          frameRatio: 0.07,
          cornerRadiusRatio: 0.025,
          frameStyle: 'solid',
          textMode: 'filename',
          customText: '',
          textPosition: 'bottom',
          topBlockRatio: 1,
          exportFormat: 'png',
          exportQuality: 0.92,
        },
      }),
    ).toEqual({
      canvasWidth: 400,
      canvasHeight: 600,
      photoX: 0,
      photoY: 300,
      photoWidth: 400,
      photoHeight: 300,
      textAreaX: 0,
      textAreaY: 0,
      textAreaWidth: 400,
      textAreaHeight: 300,
    });
  });

  it('keeps the existing framed geometry for surround layouts', () => {
    expect(
      computeCanvasLayout({
        imageWidth: 400,
        imageHeight: 300,
        frame: 40,
        template: {
          frameLayout: 'surround',
          frameRatio: 0.07,
          cornerRadiusRatio: 0.025,
          frameStyle: 'blur',
          textMode: 'filename',
          customText: '',
          textPosition: 'bottom',
          topBlockRatio: 1,
          exportFormat: 'png',
          exportQuality: 0.92,
        },
      }),
    ).toMatchObject({
      canvasWidth: 480,
      canvasHeight: 380,
      photoX: 40,
      photoY: 40,
      photoWidth: 400,
      photoHeight: 300,
    });
  });

  it('normalizes manual multiline text by trimming blank edge lines', () => {
    expect(normalizeManualTextLines('\n  Stanley, Hong Kong  \n17:49 SEPTEMBER\n\n#628ca0\n')).toEqual([
      'Stanley, Hong Kong',
      '17:49 SEPTEMBER',
      '',
      '#628ca0',
    ]);
  });

  it('lays out multiline text inside the available block', () => {
    const context = {
      font: '',
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as CanvasRenderingContext2D;

    const layout = layoutTextLines(context, ['Stanley, Hong Kong', '17:49 SEPTEMBER', '#628ca0'], {
      centerX: 200,
      centerY: 150,
      maxWidth: 260,
      maxHeight: 120,
      initialFontSize: 36,
    });

    expect(layout.fontSize).toBeLessThan(36);
    expect(layout.lines).toHaveLength(3);
    expect(layout.lines[0]).toMatchObject({ text: 'Stanley, Hong Kong', x: 200 });
    expect(layout.lines[2].y).toBeGreaterThan(layout.lines[0].y);
  });

  it('uses Isenheim with Songti fallbacks as the default caption font', () => {
    const context = {
      font: '',
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as CanvasRenderingContext2D;

    layoutTextLines(context, ['森林公园 new year'], {
      centerX: 200,
      centerY: 150,
      maxWidth: 320,
      maxHeight: 120,
      initialFontSize: 32,
    });

    expect(context.font).toBe(
      '400 32px "Isenheim", "SimSun", "宋体", "Songti SC", "STSong", "Source Han Serif SC", "Noto Serif CJK SC", serif',
    );
  });

  it('waits for the bundled caption font before canvas rendering', async () => {
    const loadCalls: string[] = [];
    const fonts = {
      load: async (font: string) => {
        loadCalls.push(font);
        return [];
      },
    };

    await ensureCaptionFontReady(fonts);

    expect(loadCalls).toEqual(['400 32px "Isenheim"']);
  });

  it('lays out smart analysis as centered metadata copy without a leading color chip', () => {
    expect(
      computeSmartAnalysisLayout({
        areaX: 0,
        areaY: 0,
        areaWidth: 600,
        areaHeight: 240,
      }),
    ).toEqual({
      textX: 174,
      titleY: 90,
      subtitleY: 122,
      detailsY: 154,
      maxTextWidth: 252,
    });
  });

  it('uses the smart analysis block even when the legacy smart caption text is empty', () => {
    expect(
      computeTextRenderMode({
        template: {
          frameLayout: 'stacked',
          frameRatio: 0.07,
          cornerRadiusRatio: 0.025,
          frameStyle: 'solid',
          textMode: 'smart',
          customText: '',
          textPosition: 'bottom',
          topBlockRatio: 1,
          exportFormat: 'png',
          exportQuality: 0.92,
        },
        fileName: 'harbour.jpg',
        smartAnalysis: {
          title: 'HARBOUR',
          subtitle: '2:54 PM',
          detailLines: ['摄于 iPhone XS 记录这一瞬'],
        },
        suggestedText: '',
      }),
    ).toEqual({
      kind: 'smartAnalysis',
      analysis: {
        title: 'HARBOUR',
        subtitle: '2:54 PM',
        detailLines: ['摄于 iPhone XS 记录这一瞬'],
      },
    });
  });

  it('moves smart analysis details up when there is no subtitle', () => {
    expect(
      computeSmartAnalysisLayout({
        areaX: 0,
        areaY: 0,
        areaWidth: 600,
        areaHeight: 240,
        hasSubtitle: false,
      }),
    ).toMatchObject({
      titleY: 90,
      subtitleY: undefined,
      detailsY: 126,
    });
  });

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
