import {
  Archive,
  CheckCircle2,
  Download,
  ImagePlus,
  Images,
  Loader2,
  Play,
  Share2,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BatchJob, FrameTemplate, PhotoFrameSettings, PhotoTransform } from './types';
import { analyzeImage } from './utils/imageAnalysis';
import { createBatchJobs, summarizeJobs } from './utils/batch';
import {
  canShareFiles,
  buildOutputFileName,
  createZipBlobAsync,
  downloadBlob,
  formatTimestamp,
  isLikelyMobile,
} from './utils/export';
import { renderFramedImage } from './utils/renderer';
import { createSmartCaption } from './utils/smartCaption';
import { createDefaultTemplate } from './utils/template';
import { createThemeWithFrameColor } from './utils/color';
import { CHINESE_FONT_OPTIONS, ENGLISH_FONT_OPTIONS, getCaptionFontFamily } from './utils/fontOptions';
import {
  PHOTO_OFFSET_MAX,
  PHOTO_OFFSET_MIN,
  PHOTO_SCALE_MAX,
  PHOTO_SCALE_MIN,
  createDefaultPhotoTransform,
  normalizePhotoTransform,
} from './utils/photoTransform';

const DEFAULT_PALETTE = ['#9f7355', '#335577', '#d9b46f', '#1f2d2b', '#efe1ce'];
const FIXED_FRAME_COLORS = ['#ffffff', '#000000'];
const AUTO_GENERATE_DELAY_MS = 500;
const IMMEDIATE_AUTO_GENERATE_DELAY_MS = 0;

type AutoGenerateRequest = {
  jobId: string;
  nonce: number;
  delayMs: number;
};

function App() {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [template, setTemplate] = useState<FrameTemplate>(() => createDefaultTemplate());
  const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [message, setMessage] = useState('照片只在浏览器本地处理。');
  const [autoGenerateRequest, setAutoGenerateRequest] = useState<AutoGenerateRequest | null>(null);
  const [autoProcessBatchRequest, setAutoProcessBatchRequest] = useState<{ jobIds: string[]; nonce: number } | null>(
    null,
  );
  const autoGenerateNonceRef = useRef(0);
  const autoProcessBatchNonceRef = useRef(0);
  const jobsRef = useRef<BatchJob[]>([]);
  const templateRef = useRef<FrameTemplate>(template);
  const isProcessingRef = useRef(false);
  const isAutoGeneratingRef = useRef(false);
  const sourceUrlsRef = useRef<Record<string, string>>({});
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const queuedAutoGenerateRequestsRef = useRef<Record<string, AutoGenerateRequest>>({});
  const latestAutoGenerateNonceByJobRef = useRef<Record<string, number>>({});

  const summary = useMemo(() => summarizeJobs(jobs), [jobs]);
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const selectedFrameTemplate = selectedJob ? getJobFrameTemplate(selectedJob, template) : template;
  const selectedPhotoTransform = normalizePhotoTransform(selectedJob?.photoTransform);
  const doneJobs = jobs.filter((job) => job.status === 'done' && job.outputBlob);
  const downloadableSelectedJob = selectedJob?.status === 'done' && selectedJob.outputBlob ? selectedJob : undefined;
  const shareFiles = useMemo(() => doneJobs.map((job) => toShareFile(job, template)), [doneJobs, template]);
  const isBusy = isProcessing || isAutoGenerating;

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    templateRef.current = template;
  }, [template]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    isAutoGeneratingRef.current = isAutoGenerating;
  }, [isAutoGenerating]);

  useEffect(() => {
    const update = () => setIsMobile(isLikelyMobile());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(sourceUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!autoGenerateRequest) {
      return;
    }

    if (autoGenerateRequest.delayMs <= 0) {
      void autoGenerateJob(autoGenerateRequest.jobId, autoGenerateRequest.nonce);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void autoGenerateJob(autoGenerateRequest.jobId, autoGenerateRequest.nonce);
    }, autoGenerateRequest.delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [autoGenerateRequest]);

  useEffect(() => {
    if (!autoProcessBatchRequest) {
      return;
    }

    const requestMatchesCurrentJobs =
      autoProcessBatchRequest.jobIds.length === jobs.length &&
      autoProcessBatchRequest.jobIds.every((id, index) => jobs[index]?.id === id);

    if (!requestMatchesCurrentJobs) {
      return;
    }

    setAutoProcessBatchRequest(null);
    void processBatch(jobs);
  }, [autoProcessBatchRequest, jobs]);

  function handleFiles(files: File[]) {
    if (!files.length) {
      return;
    }

    const nextJobs = createBatchJobs(files);
    const nextUrls = Object.fromEntries(nextJobs.map((job) => [job.id, URL.createObjectURL(job.file)]));

    revokeAllPreviewUrls();
    setJobs(nextJobs);
    Object.values(sourceUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    sourceUrlsRef.current = nextUrls;
    setSourceUrls(nextUrls);
    setSelectedId(nextJobs[0]?.id ?? null);
    setAutoGenerateRequest(null);
    setAutoProcessBatchRequest(null);
    setMessage(`${nextJobs.length} 张图片已加入队列。`);
    void hydrateSmartCaptions(nextJobs);

    const readyJobs = nextJobs.filter((job) => job.status === 'pending');
    const firstReadyJob = readyJobs[0];
    if (readyJobs.length > 1) {
      autoProcessBatchNonceRef.current += 1;
      setAutoProcessBatchRequest({
        jobIds: nextJobs.map((job) => job.id),
        nonce: autoProcessBatchNonceRef.current,
      });
      setMessage('已加入队列，正在自动批量生成。');
      return;
    }

    if (firstReadyJob) {
      scheduleAutoGenerate(firstReadyJob.id, firstReadyJob);
    }
  }

  async function processBatch(sourceJobs = jobs) {
    if (!sourceJobs.length || isProcessingRef.current || isAutoGeneratingRef.current) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setAutoGenerateRequest(null);
    setAutoProcessBatchRequest(null);
    setMessage('正在逐张分析主题色并生成边框。');

    const queue = sourceJobs.map((job) => ({
      ...job,
      status: job.status === 'failed' ? job.status : ('pending' as const),
      progress: job.status === 'failed' ? 0 : 0,
      outputBlob: undefined,
      palette: undefined,
      previewUrl: undefined,
      errorMessage: job.status === 'failed' ? job.errorMessage : undefined,
    }));
    for (const job of sourceJobs) {
      revokePreviewUrl(job.previewUrl);
    }

    setJobs(queue);

    for (const job of queue) {
      if (job.status === 'failed') {
        continue;
      }

      setSelectedId(job.id);
      setJobs((current) =>
        current.map((item) => (item.id === job.id ? { ...item, status: 'processing', progress: 18 } : item)),
      );

      try {
        const analyzedTheme = await analyzeImage(job.file);
        const jobAfterAnalysis = jobsRef.current.find((item) => item.id === job.id) ?? job;
        const theme = createThemeWithFrameColor(
          analyzedTheme.dominantColor,
          analyzedTheme.palette,
          jobAfterAnalysis.selectedFrameColor,
        );
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? { ...item, themeColor: theme.frameColor, palette: theme.palette, progress: 54 }
              : item,
          ),
        );

        const jobBeforeRender = jobsRef.current.find((item) => item.id === job.id) ?? jobAfterAnalysis;
        const result = await renderFramedImage({
          file: jobBeforeRender.file,
          template: getJobFrameTemplate(jobBeforeRender, templateRef.current),
          theme,
          mode: 'export',
          photoText: jobBeforeRender.customText,
          photoTransform: normalizePhotoTransform(jobBeforeRender.photoTransform),
          smartAnalysis: jobBeforeRender.smartAnalysis,
          suggestedText: jobBeforeRender.suggestedText,
        });
        previewUrlsRef.current.add(result.previewUrl);

        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: 'done',
                  progress: 100,
                  outputBlob: result.blob,
                  previewUrl: result.previewUrl,
                  themeColor: result.theme.frameColor,
                  palette: result.theme.palette,
                }
              : item,
          ),
        );
      } catch (error) {
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: 'failed',
                  progress: 0,
                  errorMessage: error instanceof Error ? error.message : '处理失败',
                }
              : item,
          ),
        );
      }
    }

    isProcessingRef.current = false;
    setIsProcessing(false);
  }

  async function exportZip() {
    if (!doneJobs.length || isExporting) {
      return;
    }

    try {
      setIsExporting(true);
      const zipBlob = await createZipBlobAsync(doneJobs, template.exportFormat);
      downloadBlob(zipBlob, `colorframe-${formatTimestamp()}.zip`);
      setMessage('ZIP 已生成，包含所有成功处理的图片。');
    } catch {
      setMessage('ZIP 生成失败，请尝试逐张下载。');
    } finally {
      setIsExporting(false);
    }
  }

  async function shareResults() {
    if (!shareFiles.length) {
      return;
    }

    if (!canShareFiles(shareFiles)) {
      setMessage('当前浏览器不支持系统保存/分享图片，请更换浏览器或使用桌面端下载。');
      return;
    }

    try {
      await navigator.share({
        title: 'ColorFrame',
        text: 'ColorFrame 生成的照片',
        files: shareFiles,
      });
      setMessage('已打开系统分享面板。');
    } catch {
      setMessage('分享已取消或失败，可以重新点击保存/分享图片。');
    }
  }

  function downloadOne(job: BatchJob) {
    if (!job.outputBlob) {
      return;
    }
    const name = buildOutputFileName(job.originalName, template.exportFormat, new Set());
    downloadBlob(job.outputBlob, name);
    setMessage(`已下载 ${name}。`);
  }

  function updateSelectedPhotoText(customText: string) {
    if (!selectedJob) {
      return;
    }

    const jobId = selectedJob.id;
    revokePreviewUrl(selectedJob.previewUrl);
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...markJobForRegeneration(job),
              customText,
            }
          : job,
      ),
    );
    scheduleAutoGenerate(jobId);
  }

  function updateSelectedFrameColor(selectedFrameColor: string) {
    if (!selectedJob) {
      return;
    }

    const jobId = selectedJob.id;
    revokePreviewUrl(selectedJob.previewUrl);
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...markJobForRegeneration(job),
              selectedFrameColor,
              themeColor: selectedFrameColor,
            }
          : job,
      ),
    );
    scheduleAutoGenerate(jobId);
  }

  function updateSelectedFrameSettings(nextSettings: Partial<PhotoFrameSettings>) {
    if (!selectedJob) {
      setTemplate((current) => ({
        ...current,
        ...nextSettings,
      }));
      return;
    }

    const jobId = selectedJob.id;
    const currentFrameSettings = getJobFrameSettings(selectedJob, templateRef.current);
    revokePreviewUrl(selectedJob.previewUrl);
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...markJobForRegeneration(job),
              frameSettings: {
                ...currentFrameSettings,
                ...nextSettings,
              },
            }
          : job,
      ),
    );
    scheduleAutoGenerate(jobId);
  }

  function updateSelectedPhotoTransform(nextTransform: Partial<PhotoTransform>) {
    if (!selectedJob) {
      return;
    }

    const jobId = selectedJob.id;
    const photoTransform = normalizePhotoTransform({
      ...selectedPhotoTransform,
      ...nextTransform,
    });
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...markJobForRegeneration(job, { keepRenderedOutput: true }),
              photoTransform,
            }
          : job,
      ),
    );
    scheduleAutoGenerate(jobId, undefined, { delayMs: IMMEDIATE_AUTO_GENERATE_DELAY_MS });
  }

  function resetSelectedPhotoTransform() {
    updateSelectedPhotoTransform(createDefaultPhotoTransform());
  }

  function applyCurrentFrameSettingsToAll() {
    if (!selectedJob) {
      return;
    }

    const selectedFrameSettings = getJobFrameSettings(selectedJob, templateRef.current);
    setJobs((current) =>
      current.map((job) => {
        if (job.id === selectedJob.id) {
          return job;
        }

        revokePreviewUrl(job.previewUrl);
        return {
          ...markJobForRegeneration(job),
          frameSettings: selectedFrameSettings,
        };
      }),
    );
    setMessage('已将当前边框设置应用到其他照片，色框颜色保持不变。');
  }

  function updateTemplate(nextTemplate: FrameTemplate) {
    const jobId = selectedJob?.id;
    revokeAllPreviewUrls();
    setTemplate(nextTemplate);
    setJobs((current) =>
      current.map((job) => (job.status === 'failed' ? job : markJobForRegeneration(job))),
    );

    if (jobId) {
      scheduleAutoGenerate(jobId);
    }
  }

  function scheduleAutoGenerate(
    jobId: string,
    jobOverride?: BatchJob,
    options: { delayMs?: number } = {},
  ) {
    const job = jobOverride ?? jobsRef.current.find((item) => item.id === jobId) ?? selectedJob;
    if (!job || job.status === 'failed') {
      return;
    }

    autoGenerateNonceRef.current += 1;
    const request: AutoGenerateRequest = {
      jobId,
      nonce: autoGenerateNonceRef.current,
      delayMs: options.delayMs ?? AUTO_GENERATE_DELAY_MS,
    };
    latestAutoGenerateNonceByJobRef.current[jobId] = request.nonce;
    setAutoGenerateRequest(request);
    setMessage(request.delayMs <= 0 ? '正在同步生成当前照片。' : '稍后自动生成当前照片。');
  }

  async function autoGenerateJob(jobId: string, requestNonce = autoGenerateNonceRef.current) {
    if (isProcessingRef.current || isAutoGeneratingRef.current) {
      queuedAutoGenerateRequestsRef.current[jobId] = {
        jobId,
        nonce: latestAutoGenerateNonceByJobRef.current[jobId] ?? autoGenerateNonceRef.current,
        delayMs: IMMEDIATE_AUTO_GENERATE_DELAY_MS,
      };
      return;
    }

    const job = jobsRef.current.find((item) => item.id === jobId);
    if (!job || job.status === 'failed') {
      return;
    }

    isAutoGeneratingRef.current = true;
    setIsAutoGenerating(true);
    setMessage('正在自动生成当前照片。');

    try {
      setJobs((current) =>
        current.map((item) =>
          item.id === jobId ? { ...item, status: 'processing', progress: 18, errorMessage: undefined } : item,
        ),
      );

      const analyzedTheme = await analyzeImage(job.file);
      const jobAfterAnalysis = jobsRef.current.find((item) => item.id === jobId) ?? job;
      const theme = createThemeWithFrameColor(
        analyzedTheme.dominantColor,
        analyzedTheme.palette,
        jobAfterAnalysis.selectedFrameColor,
      );
      setJobs((current) =>
        current.map((item) =>
          item.id === jobId ? { ...item, themeColor: theme.frameColor, palette: theme.palette, progress: 54 } : item,
        ),
      );

      const jobBeforeRender = jobsRef.current.find((item) => item.id === jobId) ?? job;
      const result = await renderFramedImage({
        file: jobBeforeRender.file,
        template: getJobFrameTemplate(jobBeforeRender, templateRef.current),
        theme,
        mode: 'export',
        photoText: jobBeforeRender.customText,
        photoTransform: normalizePhotoTransform(jobBeforeRender.photoTransform),
        smartAnalysis: jobBeforeRender.smartAnalysis,
        suggestedText: jobBeforeRender.suggestedText,
      });

      if (requestNonce !== latestAutoGenerateNonceByJobRef.current[jobId]) {
        URL.revokeObjectURL(result.previewUrl);
        return;
      }

      previewUrlsRef.current.add(result.previewUrl);

      setJobs((current) =>
        current.map((item) => {
          if (item.id !== jobId) {
            return item;
          }

          if (item.previewUrl && item.previewUrl !== result.previewUrl) {
            revokePreviewUrl(item.previewUrl);
          }

          return {
            ...item,
            status: 'done',
            progress: 100,
            outputBlob: result.blob,
            previewUrl: result.previewUrl,
            themeColor: result.theme.frameColor,
            palette: result.theme.palette,
          };
        }),
      );
      setMessage('已自动生成当前照片。');
    } catch (error) {
      if (requestNonce !== latestAutoGenerateNonceByJobRef.current[jobId]) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : '处理失败';
      setJobs((current) =>
        current.map((item) =>
          item.id === jobId
            ? {
                ...item,
                status: 'failed',
                progress: 0,
                errorMessage,
              }
            : item,
        ),
      );
      setMessage(`自动生成失败：${errorMessage}`);
    } finally {
      isAutoGeneratingRef.current = false;
      setIsAutoGenerating(false);
      const queuedRequest = takeNextQueuedAutoGenerateRequest();
      if (queuedRequest) {
        void autoGenerateJob(queuedRequest.jobId, queuedRequest.nonce);
      }
    }
  }

  function takeNextQueuedAutoGenerateRequest() {
    const requests = Object.values(queuedAutoGenerateRequestsRef.current);
    const request = requests.sort((left, right) => right.nonce - left.nonce)[0];
    if (request) {
      delete queuedAutoGenerateRequestsRef.current[request.jobId];
    }

    return request;
  }

  function markJobForRegeneration(
    job: BatchJob,
    options: { keepRenderedOutput?: boolean } = {},
  ): BatchJob {
    if (job.status === 'failed') {
      return {
        ...job,
        outputBlob: undefined,
        previewUrl: undefined,
      };
    }

    return {
      ...job,
      outputBlob: options.keepRenderedOutput ? job.outputBlob : undefined,
      previewUrl: options.keepRenderedOutput ? job.previewUrl : undefined,
      status: job.status === 'processing' ? job.status : 'pending',
      progress: job.status === 'processing' ? job.progress : 0,
      errorMessage: undefined,
    };
  }

  async function hydrateSmartCaptions(nextJobs: BatchJob[]) {
    await Promise.all(
      nextJobs
        .filter((job) => job.status !== 'failed')
        .map(async (job) => {
          const caption = await createSmartCaption(job.file);
          setJobs((current) =>
            current.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    suggestedText: caption.suggestedText,
                    smartAnalysis: caption.smartAnalysis,
                    captionStatus: caption.captionStatus,
                    metadataSummary: caption.metadataSummary,
                  }
                : item,
            ),
          );
        }),
    );
  }

  function revokePreviewUrl(url?: string) {
    if (!url) {
      return;
    }

    URL.revokeObjectURL(url);
    previewUrlsRef.current.delete(url);
  }

  function revokeAllPreviewUrls() {
    for (const url of Array.from(previewUrlsRef.current)) {
      revokePreviewUrl(url);
    }
  }

  const previewUrl = selectedJob?.previewUrl ?? (selectedJob ? sourceUrls[selectedJob.id] : undefined);
  const themeColor = selectedJob?.selectedFrameColor ?? selectedJob?.themeColor ?? DEFAULT_PALETTE[0];
  const canProcess = jobs.some((job) => job.status === 'pending' || job.status === 'cancelled' || job.status === 'done');

  return (
    <main className="app-root min-h-screen text-[#211d18]">
      <section className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">local photo framing studio</p>
            <h1>ColorFrame</h1>
          </div>
          <div className="privacy-pill">
            <Sparkles size={16} />
            本地处理，不上传
          </div>
        </header>

        <section className="workspace" style={{ '--active-color': themeColor } as React.CSSProperties}>
          <aside className="panel upload-panel">
            <UploadBox onFiles={handleFiles} />
            <StatusStrip summary={summary} />
            <JobList
              jobs={jobs}
              showDownloads={!isMobile}
              selectedId={selectedJob?.id}
              sourceUrls={sourceUrls}
              onSelect={setSelectedId}
              onDownload={downloadOne}
            />
          </aside>

          <section className="preview-stage">
            <div className="preview-toolbar">
              <div>
                <p className="eyebrow">preview</p>
                <h2>{selectedJob?.originalName ?? '等待照片'}</h2>
              </div>
              <div className="theme-dots" aria-label="主题色">
                {(selectedJob?.palette ?? DEFAULT_PALETTE).slice(0, 5).map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </div>
            </div>

            <PreviewCanvas>
              {previewUrl ? (
                <img src={previewUrl} alt={selectedJob?.originalName ?? '照片预览'} />
              ) : (
                <div className="empty-preview">
                  <Images size={48} />
                  <p>选择照片后，这里会显示原图或处理结果。</p>
                </div>
              )}
            </PreviewCanvas>

            {isMobile ? (
              <div className="mobile-action-bar">
                <ActionButtons
                  canProcess={canProcess}
                  doneCount={doneJobs.length}
                  isExporting={isExporting}
                  isMobile={isMobile}
                  isBusy={isBusy}
                  onDownloadCurrent={() => downloadableSelectedJob && downloadOne(downloadableSelectedJob)}
                  onProcess={processBatch}
                  onShare={shareResults}
                  onZip={exportZip}
                  selectedDone={Boolean(downloadableSelectedJob)}
                />
              </div>
            ) : null}
          </section>

          <aside className="panel controls-panel">
            <TemplateControls
              frameTemplate={selectedFrameTemplate}
              selectedJob={selectedJob}
              template={template}
              onChange={updateTemplate}
              onApplyFrameSettingsToAll={applyCurrentFrameSettingsToAll}
              onFrameColorChange={updateSelectedFrameColor}
              onFrameSettingsChange={updateSelectedFrameSettings}
              onPhotoTransformChange={updateSelectedPhotoTransform}
              onPhotoTransformReset={resetSelectedPhotoTransform}
              onPhotoTextChange={updateSelectedPhotoText}
              photoTransform={selectedPhotoTransform}
            />

            <section className="export-card">
              <div className="section-title">
                <Archive size={18} />
                <h2>导出策略</h2>
              </div>
              <p>{isMobile ? mobileExportCopy(doneJobs.length) : '桌面端批量结果默认打包为 ZIP。'}</p>
              {!isMobile ? (
                <ActionButtons
                  canProcess={canProcess}
                  doneCount={doneJobs.length}
                  isExporting={isExporting}
                  isMobile={isMobile}
                  isBusy={isBusy}
                  onDownloadCurrent={() => downloadableSelectedJob && downloadOne(downloadableSelectedJob)}
                  onProcess={processBatch}
                  onShare={shareResults}
                  onZip={exportZip}
                  selectedDone={Boolean(downloadableSelectedJob)}
                />
              ) : null}
              <p className="status-message">{message}</p>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function UploadBox({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`upload-box ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        aria-label="选择照片"
        data-testid="photo-upload"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
      />
      <ImagePlus size={30} />
      <span>选择照片</span>
      <small>支持单张和批量上传，建议一次 10-50 张。</small>
    </label>
  );
}

function StatusStrip({ summary }: { summary: ReturnType<typeof summarizeJobs> }) {
  return (
    <div className="status-strip">
      <span>{summary.pending} 张待处理</span>
      <span>{summary.done} 张完成</span>
      <span>{summary.failed} 张失败</span>
    </div>
  );
}

function JobList({
  jobs,
  showDownloads,
  selectedId,
  sourceUrls,
  onSelect,
  onDownload,
}: {
  jobs: BatchJob[];
  showDownloads: boolean;
  selectedId?: string;
  sourceUrls: Record<string, string>;
  onSelect: (id: string) => void;
  onDownload: (job: BatchJob) => void;
}) {
  if (!jobs.length) {
    return (
      <div className="empty-list">
        <p>还没有照片。上传后会在这里显示每张图片的处理状态。</p>
      </div>
    );
  }

  return (
    <div className="job-list" aria-label="批量任务列表">
      {jobs.map((job) => (
        <div className={`job-row ${selectedId === job.id ? 'active' : ''}`} key={job.id}>
          <button
            aria-label={`${job.originalName} ${statusText(job)}`}
            className="job-select"
            onClick={() => onSelect(job.id)}
            type="button"
          >
            <img src={job.previewUrl ?? sourceUrls[job.id]} alt="" />
            <span className="job-copy">
              <strong>{job.originalName}</strong>
              <small>{job.errorMessage ?? statusText(job)}</small>
            </span>
            <span className="job-status" style={{ background: job.themeColor ?? undefined }}>
              {statusIcon(job)}
            </span>
          </button>
          {showDownloads && job.outputBlob ? (
            <button
              aria-label={`下载 ${job.originalName}`}
              className="icon-download"
              data-testid={`download-job-${job.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onDownload(job);
              }}
              type="button"
            >
              <Download size={15} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PreviewCanvas({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="preview-canvas"
      data-testid="preview-canvas"
      role="presentation"
    >
      {children}
    </div>
  );
}

function TemplateControls({
  frameTemplate,
  photoTransform,
  selectedJob,
  template,
  onChange,
  onApplyFrameSettingsToAll,
  onFrameColorChange,
  onFrameSettingsChange,
  onPhotoTransformChange,
  onPhotoTransformReset,
  onPhotoTextChange,
}: {
  frameTemplate: FrameTemplate;
  photoTransform: PhotoTransform;
  selectedJob?: BatchJob;
  template: FrameTemplate;
  onChange: (template: FrameTemplate) => void;
  onApplyFrameSettingsToAll: () => void;
  onFrameColorChange: (color: string) => void;
  onFrameSettingsChange: (settings: Partial<PhotoFrameSettings>) => void;
  onPhotoTransformChange: (transform: Partial<PhotoTransform>) => void;
  onPhotoTransformReset: () => void;
  onPhotoTextChange: (customText: string) => void;
}) {
  const palette = withFixedFrameColors(selectedJob?.palette?.length ? selectedJob.palette : DEFAULT_PALETTE);
  const selectedColor = selectedJob?.selectedFrameColor ?? selectedJob?.themeColor ?? palette[0];
  const isStackedLayout = frameTemplate.frameLayout === 'stacked';
  const captionFont = getCaptionFontFamily({
    chineseFont: template.chineseFont,
    englishFont: template.englishFont,
  });

  return (
    <section
      className="controls-card"
      data-testid="template-controls"
      style={{ '--caption-font': captionFont } as React.CSSProperties}
    >
      <div className="section-title">
        <SlidersHorizontal size={18} />
        <h2>默认流程</h2>
      </div>

      <div className="field">
        <span>版式</span>
        <div className="segmented" aria-label="版式">
          {[
            ['stacked', '上色块下图'],
            ['surround', '色框包围'],
          ].map(([layout, label]) => (
            <button
              aria-pressed={frameTemplate.frameLayout === layout}
              className={frameTemplate.frameLayout === layout ? 'selected' : ''}
              data-testid={`frame-layout-${layout}`}
              key={layout}
              onClick={() => onFrameSettingsChange({ frameLayout: layout as FrameTemplate['frameLayout'] })}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isStackedLayout ? (
        <label className="field">
          <span>色块高度 {Math.round(frameTemplate.topBlockRatio * 100)}%</span>
          <input
            aria-label="色块高度"
            data-testid="top-block-ratio-input"
            max="1.2"
            min="0.35"
            step="any"
            type="range"
            value={frameTemplate.topBlockRatio}
            onChange={(event) => onFrameSettingsChange({ topBlockRatio: Number(event.target.value) })}
          />
        </label>
      ) : (
        <>
          <label className="field">
            <span>边框比例</span>
            <input
              max="0.12"
              min="0.04"
              step="0.005"
              type="range"
              value={frameTemplate.frameRatio}
              onChange={(event) => onFrameSettingsChange({ frameRatio: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            <span>圆角比例</span>
            <input
              max="0.08"
              min="0"
              step="0.005"
              type="range"
              value={frameTemplate.cornerRadiusRatio}
              onChange={(event) => onFrameSettingsChange({ cornerRadiusRatio: Number(event.target.value) })}
            />
          </label>

          <div className="field">
            <span>色框模式</span>
            <div className="segmented" aria-label="色框模式">
              {[
                ['solid', '纯色'],
                ['blur', '高斯模糊'],
              ].map(([style, label]) => (
                <button
                  aria-pressed={frameTemplate.frameStyle === style}
                  className={frameTemplate.frameStyle === style ? 'selected' : ''}
                  data-testid={`frame-style-${style}`}
                  key={style}
                  onClick={() => onFrameSettingsChange({ frameStyle: style as FrameTemplate['frameStyle'] })}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <button className="apply-current-button" disabled={!selectedJob} onClick={onApplyFrameSettingsToAll} type="button">
        应用当前
      </button>

      <div className="composition-card">
        <div className="composition-title">
          <span>图片构图</span>
          <button data-testid="photo-transform-reset" disabled={!selectedJob} onClick={onPhotoTransformReset} type="button">
            重置
          </button>
        </div>

        <label className="field">
          <span>缩放 {Math.round(photoTransform.scale * 100)}%</span>
          <input
            data-testid="photo-scale-input"
            disabled={!selectedJob}
            max={PHOTO_SCALE_MAX}
            min={PHOTO_SCALE_MIN}
            step="0.01"
            type="range"
            value={photoTransform.scale}
            onChange={(event) => onPhotoTransformChange({ scale: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>水平位置 {Math.round(photoTransform.offsetX)}</span>
          <input
            data-testid="photo-offset-x-input"
            disabled={!selectedJob}
            max={PHOTO_OFFSET_MAX}
            min={PHOTO_OFFSET_MIN}
            step="1"
            type="range"
            value={photoTransform.offsetX}
            onChange={(event) => onPhotoTransformChange({ offsetX: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>垂直位置 {Math.round(photoTransform.offsetY)}</span>
          <input
            data-testid="photo-offset-y-input"
            disabled={!selectedJob}
            max={PHOTO_OFFSET_MAX}
            min={PHOTO_OFFSET_MIN}
            step="1"
            type="range"
            value={photoTransform.offsetY}
            onChange={(event) => onPhotoTransformChange({ offsetY: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="field palette-field">
        <span>颜色</span>
        <div className="palette-picker" aria-label="颜色">
          {palette.map((color) => (
            <button
              aria-label={`选择色框颜色 ${color}`}
              aria-pressed={selectedColor.toLowerCase() === color.toLowerCase()}
              className={selectedColor.toLowerCase() === color.toLowerCase() ? 'selected' : ''}
              data-testid={`frame-color-${color.replace('#', '')}`}
              disabled={!selectedJob}
              key={color}
              onClick={() => onFrameColorChange(color)}
              style={{ background: color }}
              type="button"
            />
          ))}
        </div>
        <small>颜色：{selectedColor}</small>
      </div>

      <div className="segmented" aria-label="文字模式">
        {[
          ['filename', '文件名'],
          ['custom', '统一文字'],
          ['smart', '智能解析'],
          ['none', '无文字'],
        ].map(([mode, label]) => (
          <button
            className={template.textMode === mode ? 'selected' : ''}
            key={mode}
            onClick={() => onChange({ ...template, textMode: mode as FrameTemplate['textMode'] })}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {template.textMode === 'custom' ? (
        <label className="field">
          <span>统一文字</span>
          <textarea
            value={template.customText}
            onChange={(event) => onChange({ ...template, customText: event.target.value })}
            placeholder="例如 Shanghai / 2026"
          />
        </label>
      ) : null}

      <div className="font-controls">
        <label className="field">
          <span>中文字体</span>
          <select
            aria-label="中文字体"
            data-testid="chinese-font-select"
            value={template.chineseFont}
            onChange={(event) =>
              onChange({ ...template, chineseFont: event.target.value as FrameTemplate['chineseFont'] })
            }
          >
            {CHINESE_FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>英文字体</span>
          <select
            aria-label="英文字体"
            data-testid="english-font-select"
            value={template.englishFont}
            onChange={(event) =>
              onChange({ ...template, englishFont: event.target.value as FrameTemplate['englishFont'] })
            }
          >
            {ENGLISH_FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field photo-text-field">
        <span>当前照片文字</span>
        <textarea
          aria-label="当前照片文字"
          data-testid="photo-text-input"
          disabled={!selectedJob}
          value={selectedJob?.customText ?? ''}
          onChange={(event) => onPhotoTextChange(event.target.value)}
          placeholder={selectedJob ? '留空则使用上方文字规则' : '先选择一张照片'}
        />
        {selectedJob?.customText?.trim() ? (
          <small>专属文字：{selectedJob.customText.trim()}</small>
        ) : template.textMode === 'smart' && selectedJob?.smartAnalysis ? (
          <small>
            智能解析：{selectedJob.smartAnalysis.title}
            {selectedJob.smartAnalysis.subtitle ? ` · ${selectedJob.smartAnalysis.subtitle}` : ''}
          </small>
        ) : template.textMode === 'smart' && selectedJob?.captionStatus === 'failed' ? (
          <small>未读取到拍摄信息，已使用文件名生成。</small>
        ) : (
          <small>只覆盖当前选中的照片，批量生成时优先使用。</small>
        )}
      </label>

      {!isStackedLayout ? (
        <div className="segmented" aria-label="文字位置">
          {[
            ['bottom', '底部'],
            ['top', '顶部'],
          ].map(([position, label]) => (
            <button
              className={template.textPosition === position ? 'selected' : ''}
              key={position}
              onClick={() => onChange({ ...template, textPosition: position as FrameTemplate['textPosition'] })}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <label className="field">
        <span>导出格式</span>
        <select
          value={template.exportFormat}
          onChange={(event) =>
            onChange({ ...template, exportFormat: event.target.value as FrameTemplate['exportFormat'] })
          }
        >
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
    </section>
  );
}

function withFixedFrameColors(palette: string[]) {
  const colors = [...palette, ...FIXED_FRAME_COLORS];
  return colors.filter((color, index) => colors.findIndex((item) => item.toLowerCase() === color.toLowerCase()) === index);
}

function getJobFrameSettings(job: BatchJob, template: FrameTemplate): PhotoFrameSettings {
  return {
    frameLayout: job.frameSettings?.frameLayout ?? template.frameLayout,
    frameRatio: job.frameSettings?.frameRatio ?? template.frameRatio,
    cornerRadiusRatio: job.frameSettings?.cornerRadiusRatio ?? template.cornerRadiusRatio,
    frameStyle: job.frameSettings?.frameStyle ?? template.frameStyle,
    topBlockRatio: job.frameSettings?.topBlockRatio ?? template.topBlockRatio,
  };
}

function getJobFrameTemplate(job: BatchJob, template: FrameTemplate): FrameTemplate {
  return {
    ...template,
    ...getJobFrameSettings(job, template),
  };
}

function ActionButtons({
  canProcess,
  doneCount,
  isExporting,
  isMobile,
  isBusy,
  onDownloadCurrent,
  onProcess,
  onShare,
  onZip,
  selectedDone,
}: {
  canProcess: boolean;
  doneCount: number;
  isExporting: boolean;
  isMobile: boolean;
  isBusy: boolean;
  onDownloadCurrent: () => void;
  onProcess: () => void;
  onShare: () => void;
  onZip: () => void;
  selectedDone: boolean;
}) {
  return (
    <div className="action-grid">
      <button
        className="primary-action"
        data-testid="process-batch"
        disabled={!canProcess || isBusy}
        onClick={() => onProcess()}
        type="button"
      >
        {isBusy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
        批量生成
      </button>
      {isMobile ? (
        <button className="primary-action" disabled={!doneCount} onClick={onShare} type="button">
          <Share2 size={18} />
          保存/分享图片
        </button>
      ) : null}
      {!isMobile ? (
        <button
          className="secondary-action"
          data-testid="download-current"
          disabled={!selectedDone}
          onClick={onDownloadCurrent}
          type="button"
        >
          <Download size={18} />
          下载当前图片
        </button>
      ) : null}
      {!isMobile ? (
        <button className="secondary-action" disabled={!doneCount || isExporting} onClick={onZip} type="button">
          {isExporting ? <Loader2 className="spin" size={18} /> : <Archive size={18} />}
          下载 ZIP
        </button>
      ) : null}
    </div>
  );
}

function mobileExportCopy(doneCount: number) {
  if (!doneCount) {
    return '移动端完成生成后，可通过系统分享面板保存或转发图片。';
  }

  return `${doneCount} 张图片可通过系统分享面板保存或转发。`;
}

function statusText(job: BatchJob) {
  const labels = {
    pending: '等待处理',
    processing: `${job.progress}%`,
    done: '已完成',
    failed: '处理失败',
    cancelled: '已取消',
  };

  return labels[job.status];
}

function statusIcon(job: BatchJob) {
  if (job.status === 'done') {
    return <CheckCircle2 size={15} />;
  }

  if (job.status === 'processing') {
    return <Loader2 className="spin" size={15} />;
  }

  if (job.status === 'failed') {
    return <TriangleAlert size={15} />;
  }

  if (job.status === 'cancelled') {
    return <X size={15} />;
  }

  return <span>{Math.round(job.progress)}</span>;
}

function toShareFile(job: BatchJob, template: FrameTemplate): File {
  const extension = template.exportFormat === 'jpeg' ? 'jpg' : template.exportFormat;
  const name = `${job.originalName.replace(/\.[^/.]+$/, '')}_colorframe.${extension}`;

  return new File([job.outputBlob ?? new Blob()], name, { type: job.outputBlob?.type || `image/${extension}` });
}

export default App;
