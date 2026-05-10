import { parse } from 'exifr';
import type { PhotoMetadataSummary, SmartAnalysis, SmartCaptionStatus } from '../types';
import { stripExtension } from './template';

type SmartCaptionInput = {
  fileName: string;
  takenAt?: Date;
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

export type SmartCaptionResult = {
  suggestedText: string;
  smartAnalysis?: SmartAnalysis;
  captionStatus: SmartCaptionStatus;
  metadataSummary?: PhotoMetadataSummary;
};

type ExifResult = {
  DateTimeOriginal?: Date;
  CreateDate?: Date;
  ModifyDate?: Date;
  Make?: string;
  Model?: string;
  latitude?: number;
  longitude?: number;
  GPSAltitude?: number;
  GPSSpeed?: number;
  GPSSpeedRef?: string;
  GPSImgDirection?: number;
  GPSDestBearing?: number;
  ExposureTime?: number;
  FNumber?: number;
  ISO?: number;
  ISOSpeedRatings?: number;
  FocalLengthIn35mmFormat?: number;
  FocalLength?: number;
};

export async function createSmartCaption(file: File): Promise<SmartCaptionResult> {
  try {
    const metadata = (await parse(file, {
      gps: true,
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
        'Make',
        'Model',
        'latitude',
        'longitude',
        'GPSAltitude',
        'GPSSpeed',
        'GPSSpeedRef',
        'GPSImgDirection',
        'GPSDestBearing',
        'ExposureTime',
        'FNumber',
        'ISO',
        'ISOSpeedRatings',
        'FocalLengthIn35mmFormat',
        'FocalLength',
      ],
    })) as ExifResult | undefined;
    const takenAt = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
    const camera = [metadata?.Make, metadata?.Model].filter(Boolean).join(' ').trim() || undefined;
    const hasGps = Number.isFinite(metadata?.latitude) && Number.isFinite(metadata?.longitude);
    const input = {
      fileName: file.name,
      takenAt,
      camera,
      hasGps,
      latitude: metadata?.latitude,
      longitude: metadata?.longitude,
      altitude: metadata?.GPSAltitude,
      speed: metadata?.GPSSpeed,
      speedRef: metadata?.GPSSpeedRef,
      direction: metadata?.GPSImgDirection ?? metadata?.GPSDestBearing,
      exposureTime: metadata?.ExposureTime,
      fNumber: metadata?.FNumber,
      iso: metadata?.ISO ?? metadata?.ISOSpeedRatings,
      focalLengthIn35mm: metadata?.FocalLengthIn35mmFormat ?? metadata?.FocalLength,
    };

    return {
      suggestedText: buildSmartCaption(input),
      smartAnalysis: buildSmartAnalysis(input),
      captionStatus: 'ready',
      metadataSummary: toMetadataSummary(input),
    };
  } catch {
    const input = { fileName: file.name };
    return {
      suggestedText: buildSmartCaption(input),
      smartAnalysis: buildSmartAnalysis(input),
      captionStatus: 'failed',
    };
  }
}

export function buildSmartAnalysis(input: SmartCaptionInput): SmartAnalysis {
  const subject = cleanCaptionSubject(input.fileName);
  const title = (subject || stripExtension(input.fileName) || 'PHOTO COLORS').toUpperCase();
  const subtitle = input.takenAt ? formatTime(input.takenAt) : undefined;
  const detailLines = [
    formatCameraLine(input.camera),
    formatLocationLine(input),
    formatDirectionLine(input.direction),
    formatCameraSettingsLine(input),
  ].filter((line): line is string => Boolean(line));

  return subtitle ? { title, subtitle, detailLines } : { title, detailLines };
}

export function buildSmartCaption(input: SmartCaptionInput): string {
  const subject = cleanCaptionSubject(input.fileName);

  if (subject) {
    return `把 ${subject} 的颜色留在这一刻`;
  }

  if (input.takenAt) {
    return `${input.takenAt.getFullYear()} ${seasonName(input.takenAt)}的一张照片`;
  }

  if (input.hasGps) {
    return '在路上的一刻';
  }

  return '此刻的颜色';
}

export function cleanCaptionSubject(fileName: string): string {
  const withoutExtension = stripExtension(fileName)
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:img|dsc|photo|image|wechatimg|pxl)\b/gi, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return withoutExtension;
}

function seasonName(date: Date): string {
  const month = date.getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return '春日';
  }

  if (month >= 6 && month <= 8) {
    return '夏日';
  }

  if (month >= 9 && month <= 11) {
    return '秋日';
  }

  return '冬日';
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .toUpperCase();
}

function formatCameraLine(camera?: string): string | undefined {
  return camera ? `摄于 ${camera} 记录这一瞬` : undefined;
}

function formatLocationLine(input: SmartCaptionInput): string | undefined {
  const { latitude, longitude } = input;
  if (
    !input.hasGps ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return undefined;
  }

  const details = [formatCoordinates(latitude, longitude)];
  if (Number.isFinite(input.altitude)) {
    details.push(`海拔约 ${trimNumber(Math.round(input.altitude ?? 0))}m`);
  }

  if (Number.isFinite(input.speed)) {
    details.push(`${formatSpeed(input.speed ?? 0, input.speedRef)} 穿行`);
  }

  return `拍摄位置 ${details.join(' · ')}`;
}

function formatCoordinates(latitude: number, longitude: number): string {
  return `${formatCoordinate(latitude, 'N', 'S')}, ${formatCoordinate(longitude, 'E', 'W')}`;
}

function formatCoordinate(value: number, positiveSuffix: string, negativeSuffix: string): string {
  const suffix = value < 0 ? negativeSuffix : positiveSuffix;
  return `${trimCoordinate(Math.abs(value))}°${suffix}`;
}

function formatSpeed(speed: number, ref?: string): string {
  const normalizedRef = ref?.toUpperCase();
  if (normalizedRef === 'M') {
    return `${trimNumber(speed)}英里/小时`;
  }

  if (normalizedRef === 'N') {
    return `${trimNumber(speed)}节`;
  }

  return `${trimNumber(speed)}公里/小时`;
}

function formatDirectionLine(direction?: number): string | undefined {
  if (!Number.isFinite(direction)) {
    return undefined;
  }

  return `拍摄时正面向 ${formatDirection(direction ?? 0)}`;
}

function formatDirection(direction: number): string {
  const directions = [
    '北',
    '东北偏北',
    '东北',
    '东偏东北',
    '东',
    '东偏东南',
    '东南',
    '南偏东南',
    '南',
    '南偏西南',
    '西南',
    '西偏西南',
    '西',
    '西偏西北',
    '西北',
    '北偏西北',
  ];
  const index = Math.round((((direction % 360) + 360) % 360) / 22.5) % directions.length;

  return directions[index];
}

function formatCameraSettingsLine(input: SmartCaptionInput): string | undefined {
  const settings = [
    input.fNumber ? `F/${trimNumber(input.fNumber)}` : undefined,
    input.exposureTime ? formatExposureTime(input.exposureTime) : undefined,
    input.iso ? `ISO ${Math.round(input.iso)}` : undefined,
    input.focalLengthIn35mm ? `${Math.round(input.focalLengthIn35mm)}mm` : undefined,
  ].filter(Boolean);

  return settings.length ? `这张照片的相机参数为 ${settings.join(' · ')}` : undefined;
}

function formatExposureTime(exposureTime: number): string {
  if (exposureTime > 0 && exposureTime < 1) {
    return `1/${Math.round(1 / exposureTime)}s`;
  }

  return `${trimNumber(exposureTime)}s`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function trimCoordinate(value: number): string {
  return String(Number(value.toFixed(4)));
}

function toMetadataSummary(input: SmartCaptionInput): PhotoMetadataSummary {
  return {
    takenAt: input.takenAt?.toISOString(),
    camera: input.camera,
    hasGps: input.hasGps,
    latitude: input.hasGps ? input.latitude : undefined,
    longitude: input.hasGps ? input.longitude : undefined,
    altitude: input.hasGps ? input.altitude : undefined,
    speed: input.hasGps ? input.speed : undefined,
    speedRef: input.hasGps ? input.speedRef : undefined,
    direction: input.direction,
    exposureTime: input.exposureTime,
    fNumber: input.fNumber,
    iso: input.iso,
    focalLengthIn35mm: input.focalLengthIn35mm,
  };
}
