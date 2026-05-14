import { describe, expect, it } from 'vitest';
import { CHINESE_FONT_OPTIONS, ENGLISH_FONT_OPTIONS, getCaptionFontFamily } from '../utils/fontOptions';

describe('font options', () => {
  it('offers generic Chinese and English font choices with safe font stacks', () => {
    expect(CHINESE_FONT_OPTIONS).toEqual(
      expect.arrayContaining([{ value: 'state-banquet-songti', label: '宋体' }]),
    );
    expect(ENGLISH_FONT_OPTIONS).toEqual(
      expect.arrayContaining([{ value: 'state-banquet-serif', label: 'Times New Roman' }]),
    );

    expect(
      getCaptionFontFamily({
        chineseFont: 'state-banquet-songti',
        englishFont: 'state-banquet-serif',
      }),
    ).toBe(
      '"Times New Roman", "Nimbus Roman", "Liberation Serif", Georgia, "SimSun", "宋体", "Songti SC", "STSong", "Source Han Serif SC", "Noto Serif CJK SC", "Zhuque Fangsong", serif',
    );
  });
});
