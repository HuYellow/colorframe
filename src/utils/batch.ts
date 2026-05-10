import type { BatchJob, BatchJobStatus, BatchSummary } from '../types';
import { createDefaultPhotoTransform } from './photoTransform';

const imageMimePattern = /^image\/(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i;

export function isSupportedImageFile(file: File): boolean {
  return imageMimePattern.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);
}

export function createBatchJobs(files: File[]): BatchJob[] {
  return files.map((file, index) => {
    const valid = isSupportedImageFile(file);

    return {
      id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
      file,
      originalName: file.name,
      status: valid ? 'pending' : 'failed',
      progress: 0,
      photoTransform: createDefaultPhotoTransform(),
      errorMessage: valid ? undefined : '不支持的文件类型',
    };
  });
}

export function summarizeJobs(jobs: BatchJob[]): BatchSummary {
  const summary: BatchSummary = {
    total: jobs.length,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const job of jobs) {
    summary[job.status] += 1;
  }

  return summary;
}

export function isBatchRunning(jobs: BatchJob[]): boolean {
  return jobs.some((job) => job.status === 'processing');
}

export function countByStatus(jobs: BatchJob[], status: BatchJobStatus): number {
  return jobs.filter((job) => job.status === status).length;
}
