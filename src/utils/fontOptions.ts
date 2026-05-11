import type { CaptionChineseFont, CaptionEnglishFont } from '../types';

const DEFAULT_CHINESE_FONT: CaptionChineseFont = 'zhuque-fangsong';
const DEFAULT_ENGLISH_FONT: CaptionEnglishFont = 'isenheim';

const CHINESE_FONT_STACKS: Record<CaptionChineseFont, string[]> = {
  'zhuque-fangsong': [
    '"Zhuque Fangsong"',
    '"SimSun"',
    '"宋体"',
    '"Songti SC"',
    '"STSong"',
    '"Source Han Serif SC"',
    '"Noto Serif CJK SC"',
  ],
  'system-songti': ['"SimSun"', '"宋体"', '"Songti SC"', '"STSong"', '"Source Han Serif SC"', '"Noto Serif CJK SC"'],
};

const ENGLISH_FONT_STACKS: Record<CaptionEnglishFont, string[]> = {
  isenheim: ['"Isenheim"'],
  'system-serif': ['Georgia', '"Times New Roman"'],
};

export const CHINESE_FONT_OPTIONS: { value: CaptionChineseFont; label: string }[] = [
  { value: 'zhuque-fangsong', label: '朱雀仿宋' },
  { value: 'system-songti', label: '系统宋体' },
];

export const ENGLISH_FONT_OPTIONS: { value: CaptionEnglishFont; label: string }[] = [
  { value: 'isenheim', label: 'Isenheim' },
  { value: 'system-serif', label: 'System Serif' },
];

export function getCaptionFontFamily({
  chineseFont = DEFAULT_CHINESE_FONT,
  englishFont = DEFAULT_ENGLISH_FONT,
}: {
  chineseFont?: CaptionChineseFont;
  englishFont?: CaptionEnglishFont;
} = {}): string {
  return [...ENGLISH_FONT_STACKS[englishFont], ...CHINESE_FONT_STACKS[chineseFont], 'serif'].join(', ');
}
