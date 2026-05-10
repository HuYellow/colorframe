import { zipSync } from 'fflate';
import type { BatchJob, ExportFormat } from '../types';

export type MobileExportMode = 'share' | 'download' | 'zip';

export function buildOutputFileName(originalName: string, format: ExportFormat, usedNames: Set<string>): string {
  const extension = format === 'jpeg' ? 'jpg' : format;
  const base = originalName.replace(/\.[^/.]+$/, '') || 'image';
  let candidate = `${base}_colorframe.${extension}`;
  let index = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}_colorframe-${index}.${extension}`;
    index += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function getMobileExportMode({
  count,
  canShareFiles,
}: {
  count: number;
  canShareFiles: boolean;
}): MobileExportMode {
  if (count >= 10) {
    return 'zip';
  }

  return canShareFiles ? 'share' : 'download';
}

export function isLikelyMobile(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 720;
}

export function canShareFiles(files: File[]): boolean {
  return Boolean(navigator.canShare?.({ files }));
}

export async function createZipBlobAsync(jobs: BatchJob[], format: ExportFormat): Promise<Blob> {
  const usedNames = new Set<string>();
  const files: Record<string, Uint8Array> = {};

  for (const job of jobs) {
    if (job.status === 'done' && job.outputBlob) {
      const name = buildOutputFileName(job.originalName, format, usedNames);
      files[name] = new Uint8Array(await job.outputBlob.arrayBuffer());
    }
  }

  const zipped = zipSync(files, { level: 6 });
  const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/zip' });
}

export function formatTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
