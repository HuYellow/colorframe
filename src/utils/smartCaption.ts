import { parse } from 'exifr';
import type { PhotoMetadataSummary, SmartCaptionStatus } from '../types';
import { stripExtension } from './template';

type SmartCaptionInput = {
  fileName: string;
  takenAt?: Date;
  camera?: string;
  hasGps?: boolean;
  latitude?: number;
  longitude?: number;
};

export type SmartCaptionResult = {
  suggestedText: string;
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
};

export async function createSmartCaption(file: File): Promise<SmartCaptionResult> {
  try {
    const metadata = (await parse(file, {
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'Make', 'Model', 'latitude', 'longitude'],
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
    };

    return {
      suggestedText: buildSmartCaption(input),
      captionStatus: 'ready',
      metadataSummary: toMetadataSummary(input),
    };
  } catch {
    return {
      suggestedText: buildSmartCaption({ fileName: file.name }),
      captionStatus: 'failed',
    };
  }
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

function toMetadataSummary(input: SmartCaptionInput): PhotoMetadataSummary {
  return {
    takenAt: input.takenAt?.toISOString(),
    camera: input.camera,
    hasGps: input.hasGps,
    latitude: input.hasGps ? input.latitude : undefined,
    longitude: input.hasGps ? input.longitude : undefined,
  };
}
