export type BatchJobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export type TextMode = 'filename' | 'custom' | 'smart' | 'none';

export type TextPosition = 'bottom' | 'top';

export type CaptionChineseFont = 'zhuque-fangsong' | 'state-banquet-songti' | 'system-songti';

export type CaptionEnglishFont = 'isenheim' | 'state-banquet-serif' | 'system-serif';

export type FrameStyle = 'solid' | 'blur';

export type FrameLayout = 'stacked' | 'surround';

export type FrameTemplate = {
  frameLayout: FrameLayout;
  frameRatio: number;
  cornerRadiusRatio: number;
  frameStyle: FrameStyle;
  topBlockRatio: number;
  textMode: TextMode;
  customText: string;
  textPosition: TextPosition;
  chineseFont: CaptionChineseFont;
  englishFont: CaptionEnglishFont;
  exportFormat: ExportFormat;
  exportQuality: number;
};

export type PhotoFrameSettings = Pick<
  FrameTemplate,
  'frameLayout' | 'frameRatio' | 'cornerRadiusRatio' | 'frameStyle' | 'topBlockRatio'
>;

export type PhotoTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type ColorTheme = {
  dominantColor: string;
  frameColor: string;
  textColor: string;
  surfaceColor: string;
  palette: string[];
};

export type SmartCaptionStatus = 'idle' | 'ready' | 'failed';

export type PhotoMetadataSummary = {
  takenAt?: string;
  camera?: string;
  hasGps?: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  speed?: number;
  speedRef?: string;
  direction?: number;
  exposureTime?: number;
  fNumber?: number;
  iso?: number;
  focalLengthIn35mm?: number;
};

export type SmartAnalysis = {
  title: string;
  subtitle?: string;
  detailLines: string[];
};

export type BatchJob = {
  id: string;
  file: File;
  originalName: string;
  status: BatchJobStatus;
  progress: number;
  customText?: string;
  suggestedText?: string;
  smartAnalysis?: SmartAnalysis;
  captionStatus?: SmartCaptionStatus;
  metadataSummary?: PhotoMetadataSummary;
  frameSettings?: PhotoFrameSettings;
  photoTransform?: PhotoTransform;
  selectedFrameColor?: string;
  themeColor?: string;
  palette?: string[];
  outputBlob?: Blob;
  previewUrl?: string;
  errorMessage?: string;
};

export type BatchSummary = Record<BatchJobStatus, number> & {
  total: number;
};

export type RenderResult = {
  blob: Blob;
  previewUrl: string;
  theme: ColorTheme;
};
