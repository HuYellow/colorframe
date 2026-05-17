import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const mocks = vi.hoisted(() => ({
  analyzeImage: vi.fn(),
  renderFramedImage: vi.fn(),
  createSmartCaption: vi.fn(),
}));

vi.mock('../utils/imageAnalysis', () => ({
  analyzeImage: mocks.analyzeImage,
}));

vi.mock('../utils/renderer', () => ({
  renderFramedImage: mocks.renderFramedImage,
}));

vi.mock('../utils/smartCaption', () => ({
  createSmartCaption: mocks.createSmartCaption,
}));

describe('ColorFrame app', () => {
  const originalCreateElement = document.createElement.bind(document);
  let downloadClick: ReturnType<typeof vi.fn<() => void>>;
  let lastCreatedAnchor: HTMLAnchorElement | undefined;

  beforeEach(() => {
    downloadClick = vi.fn<() => void>();
    lastCreatedAnchor = undefined;
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        lastCreatedAnchor = element as HTMLAnchorElement;
        vi.spyOn(element, 'click').mockImplementation(() => downloadClick());
      }

      return element;
    }) as typeof document.createElement);
    mocks.analyzeImage.mockResolvedValue({
      dominantColor: '#9f7355',
      frameColor: '#9f7355',
      textColor: '#fffaf1',
      surfaceColor: '#efe1ce',
      palette: ['#9f7355', '#335577', '#d9b46f'],
    });
    mocks.renderFramedImage.mockImplementation(async ({ theme }) => ({
      blob: new Blob(['framed'], { type: 'image/png' }),
      previewUrl: 'blob:colorframe-preview',
      theme,
    }));
    mocks.createSmartCaption.mockResolvedValue({
      suggestedText: '把 a 的颜色留在这一刻',
      captionStatus: 'ready',
      metadataSummary: { hasGps: false },
      smartAnalysis: {
        title: 'A',
        subtitle: '此刻',
        detailLines: ['摄于未知设备'],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mocks.analyzeImage.mockReset();
    mocks.renderFramedImage.mockReset();
    mocks.createSmartCaption.mockReset();
  });

  it('renders upload, template, queue, and export surfaces', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /ColorFrame/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/选择照片/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /批量生成/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /取消/i })).not.toBeInTheDocument();
    expect(screen.getByText(/导出策略/i)).toBeInTheDocument();
  });

  it('adds selected images to the batch list and starts processing them', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/选择照片/i);
    await user.upload(input, [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);

    expect(await screen.findAllByText('a.png')).not.toHaveLength(0);
    expect(screen.getAllByText('b.jpg')).not.toHaveLength(0);
    await waitFor(() => expect(screen.getByText(/2 张完成/i)).toBeInTheDocument());
  });

  it('auto processes every valid image after a multi-upload', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText('选择照片'), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);

    expect(await screen.findAllByText('a.png')).not.toHaveLength(0);
    expect(screen.getAllByText('b.jpg')).not.toHaveLength(0);
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));
    expect(mocks.renderFramedImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        file: expect.objectContaining({ name: 'a.png' }),
        template: expect.objectContaining({
          frameLayout: 'stacked',
          frameStyle: 'solid',
          topBlockRatio: 7 / 9,
          textMode: 'custom',
          customText: '请输入文本',
          chineseFontSize: 14,
          englishFontSize: 14,
        }),
      }),
    );
    expect(mocks.renderFramedImage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        file: expect.objectContaining({ name: 'b.jpg' }),
        template: expect.objectContaining({
          frameLayout: 'stacked',
          frameStyle: 'solid',
          topBlockRatio: 7 / 9,
          textMode: 'custom',
          customText: '请输入文本',
          chineseFontSize: 14,
          englishFontSize: 14,
        }),
      }),
    );
    expect(screen.getByText(/2 张完成/i)).toBeInTheDocument();
  });

  it('auto processes valid images in a mixed upload without rendering invalid files', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('选择照片'), {
      target: {
        files: [
          new File(['image-a'], 'a.png', { type: 'image/png' }),
          new File(['notes'], 'notes.txt', { type: 'text/plain' }),
          new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));
    expect(mocks.renderFramedImage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: 'notes.txt' }),
      }),
    );
    expect(screen.getByText(/2 张完成/i)).toBeInTheDocument();
    expect(screen.getByText(/1 张失败/i)).toBeInTheDocument();
  });

  it('lets the selected photo store custom text', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: /^a\.png/i }));
    await user.type(await screen.findByLabelText(/当前照片文字/i), 'First caption');
    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));
    await user.type(screen.getByLabelText(/当前照片文字/i), 'Second caption');
    await user.click(screen.getByRole('button', { name: /^a\.png/i }));

    expect(screen.getByLabelText(/当前照片文字/i)).toHaveValue('First caption');
    expect(screen.getByText(/专属文字：First caption/i)).toBeInTheDocument();
  });

  it('lets template and selected-photo text keep manual line breaks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /统一文字/i }));
    fireEvent.change(screen.getByLabelText(/统一文字/i), {
      target: { value: 'Stanley, Hong Kong\n17:49 SEPTEMBER' },
    });

    expect(screen.getByLabelText(/统一文字/i)).toHaveValue('Stanley, Hong Kong\n17:49 SEPTEMBER');

    await user.upload(screen.getByLabelText(/选择照片/i), [new File(['image-a'], 'a.png', { type: 'image/png' })]);
    fireEvent.change(screen.getByLabelText(/当前照片文字/i), {
      target: { value: 'Line one\nLine two' },
    });

    expect(screen.getByLabelText(/当前照片文字/i)).toHaveValue('Line one\nLine two');
  });

  it('defaults to unified text and removes the filename text option', () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: /文件名/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /统一文字/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/统一文字/i)).toHaveValue('请输入文本');
  });

  it('lets Chinese and English caption fonts be selected independently', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });

    expect(screen.getByLabelText(/中文字体/i)).toHaveValue('zhuque-fangsong');
    expect(screen.getByLabelText(/英文字体/i)).toHaveValue('isenheim');
    expect(screen.getByTestId('template-controls')).toHaveAttribute(
      'style',
      expect.stringContaining('"Isenheim", "Zhuque Fangsong"'),
    );

    fireEvent.change(screen.getByLabelText(/中文字体/i), { target: { value: 'system-songti' } });
    fireEvent.change(screen.getByLabelText(/英文字体/i), { target: { value: 'system-serif' } });
    expect(screen.getByTestId('template-controls')).toHaveAttribute(
      'style',
      expect.stringContaining('Georgia, "Times New Roman", "SimSun"'),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({
          chineseFont: 'system-songti',
          englishFont: 'system-serif',
        }),
      }),
    );
  });

  it('lets Chinese and English caption sizes be adjusted independently', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });

    expect(screen.getByLabelText(/中文字号/i)).toHaveValue(14);
    expect(screen.getByLabelText(/英文字号/i)).toHaveValue(14);

    fireEvent.change(screen.getByLabelText(/中文字号/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/英文字号/i), { target: { value: '22' } });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({
          chineseFontSize: 18,
          englishFontSize: 22,
        }),
      }),
    );
  });

  it('offers smart analysis mode and renders with parsed image information', async () => {
    vi.useFakeTimers();
    mocks.createSmartCaption.mockResolvedValueOnce({
      suggestedText: '把 garden walk 的颜色留在这一刻',
      captionStatus: 'ready',
      metadataSummary: { hasGps: false },
      smartAnalysis: {
        title: 'GARDEN WALK',
        subtitle: '2:54 PM',
        detailLines: ['摄于 iPhone XS 记录这一瞬'],
      },
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText(/选择照片/i), {
      target: { files: [new File(['image-a'], 'garden_walk.png', { type: 'image/png' })] },
    });

    expect(screen.getByRole('button', { name: /智能解析/i })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.createSmartCaption).toHaveBeenCalledWith(expect.objectContaining({ name: 'garden_walk.png' }));
    fireEvent.click(screen.getByRole('button', { name: /智能解析/i }));

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: 'garden_walk.png' }),
        template: expect.objectContaining({ textMode: 'smart' }),
        suggestedText: '把 garden walk 的颜色留在这一刻',
        smartAnalysis: {
          title: 'GARDEN WALK',
          subtitle: '2:54 PM',
          detailLines: ['摄于 iPhone XS 记录这一瞬'],
        },
      }),
    );
    expect(screen.getByText(/智能解析：GARDEN WALK · 2:54 PM/i)).toBeInTheDocument();
  });

  it('lets the selected photo store a chosen palette color and fixed black or white colors', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [new File(['image-a'], 'a.png', { type: 'image/png' })]);
    expect(screen.getByRole('button', { name: /选择色框颜色 #ffffff/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择色框颜色 #000000/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /选择色框颜色 #335577/i }));

    expect(screen.getByRole('button', { name: /选择色框颜色 #335577/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/颜色：#335577/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /选择色框颜色 #ffffff/i }));

    expect(screen.getByRole('button', { name: /选择色框颜色 #ffffff/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/颜色：#ffffff/i)).toBeInTheDocument();
  });

  it('lets users switch between layouts and solid or blur frame modes', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('button', { name: /上色块下图/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/色块高度/i)).toHaveValue(String(7 / 9));
    expect(screen.queryByRole('button', { name: /高斯模糊/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /色框包围/i }));
    expect(screen.getByRole('button', { name: /纯色/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /高斯模糊/i }));

    expect(screen.getByRole('button', { name: /高斯模糊/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /纯色/i }));

    expect(screen.getByRole('button', { name: /纯色/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps layout, top block height, frame ratio, corner radius, and frame mode local to the selected photo', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /^a\.png/i }));
    fireEvent.change(screen.getByLabelText(/色块高度/i), { target: { value: '0.6' } });
    await user.click(screen.getByRole('button', { name: /色框包围/i }));
    fireEvent.change(screen.getByLabelText(/边框比例/i), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText(/圆角比例/i), { target: { value: '0.04' } });
    await user.click(screen.getByRole('button', { name: /高斯模糊/i }));

    expect(screen.getByRole('button', { name: /色框包围/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/边框比例/i)).toHaveValue('0.1');
    expect(screen.getByLabelText(/圆角比例/i)).toHaveValue('0.04');
    expect(screen.getByRole('button', { name: /高斯模糊/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));

    expect(screen.getByRole('button', { name: /上色块下图/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/色块高度/i)).toHaveValue(String(7 / 9));
  });

  it('applies the current frame settings to other photos without changing their frame colors', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));
    await user.click(screen.getByRole('button', { name: /选择色框颜色 #000000/i }));
    await user.click(screen.getByRole('button', { name: /^a\.png/i }));
    fireEvent.change(screen.getByLabelText(/色块高度/i), { target: { value: '0.6' } });
    await user.click(screen.getByRole('button', { name: /色框包围/i }));
    fireEvent.change(screen.getByLabelText(/边框比例/i), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText(/圆角比例/i), { target: { value: '0.04' } });
    await user.click(screen.getByRole('button', { name: /高斯模糊/i }));
    await user.click(screen.getByRole('button', { name: /应用当前/i }));
    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));

    expect(screen.getByRole('button', { name: /色框包围/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/边框比例/i)).toHaveValue('0.1');
    expect(screen.getByLabelText(/圆角比例/i)).toHaveValue('0.04');
    expect(screen.getByRole('button', { name: /高斯模糊/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /选择色框颜色 #000000/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('downloads the currently selected finished photo from the export controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));
    await user.click(screen.getByRole('button', { name: /下载当前图片/i }));

    expect(downloadClick).toHaveBeenCalledTimes(1);
    expect(lastCreatedAnchor).toHaveAttribute('download', 'b_colorframe.png');
  });

  it('keeps only process and share actions on mobile browsers that cannot share files', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    const shareSpy = vi.fn();
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareSpy,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));

    expect(shareSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('download-current')).not.toBeInTheDocument();
    expect(screen.queryByTestId('download-batch')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^download-job-/)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /保存\/分享图片/i }));

    expect(shareSpy).not.toHaveBeenCalled();
    expect(downloadClick).not.toHaveBeenCalled();
  });

  it('keeps mobile batch export on the share/save path even for larger batches', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareSpy,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.upload(
      screen.getByLabelText(/选择照片/i),
      Array.from({ length: 10 }, (_, index) => new File([`image-${index}`], `photo-${index + 1}.png`, { type: 'image/png' })),
    );
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(10));

    expect(screen.queryByRole('button', { name: /下载 ZIP/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('download-batch')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^download-job-/)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /保存\/分享图片/i }));

    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(downloadClick).not.toHaveBeenCalled();
  });

  it('auto generates the first uploaded photo with the default template after half a second', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/选择照片/i), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });

    expect(screen.getByText(/稍后自动生成当前照片/i)).toBeInTheDocument();
    expect(mocks.renderFramedImage).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(499);
    });

    expect(mocks.renderFramedImage).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(1);
    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: 'a.png' }),
        template: expect.objectContaining({
          frameLayout: 'stacked',
          frameStyle: 'solid',
          topBlockRatio: 7 / 9,
          textMode: 'custom',
          customText: '请输入文本',
          chineseFontSize: 14,
          englishFontSize: 14,
        }),
      }),
    );
    expect(screen.getByText(/1 张完成/i)).toBeInTheDocument();
  });

  it('auto regenerates the selected photo half a second after text changes', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/选择照片/i), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByLabelText(/当前照片文字/i), {
      target: { value: 'Auto caption' },
    });

    expect(screen.getByText(/稍后自动生成当前照片/i)).toBeInTheDocument();
    expect(mocks.renderFramedImage).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(499);
    });

    expect(mocks.renderFramedImage).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(1);
    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: 'a.png' }),
        mode: 'export',
        photoText: 'Auto caption',
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/1 张完成/i)).toBeInTheDocument();
  });

  it('auto regenerates with the latest frame color and mode after half a second', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/选择照片/i), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /选择色框颜色 #335577/i }));
    fireEvent.click(screen.getByRole('button', { name: /色框包围/i }));
    fireEvent.click(screen.getByRole('button', { name: /高斯模糊/i }));

    expect(screen.getByText(/稍后自动生成当前照片/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(499);
    });

    expect(mocks.renderFramedImage).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(1);
    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({ frameStyle: 'blur' }),
        theme: expect.objectContaining({ frameColor: '#335577' }),
      }),
    );
  });

  it('regenerates the selected photo immediately while the color block height slider moves', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByTestId('top-block-ratio-input'), { target: { value: '0.95' } });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalled();
    expect(mocks.renderFramedImage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({ topBlockRatio: 0.95 }),
      }),
    );
  });

  it('regenerates the selected photo immediately while composition controls move', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByTestId('photo-scale-input'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('photo-offset-y-input'), { target: { value: '-40' } });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalled();
    expect(mocks.renderFramedImage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        photoTransform: { scale: 1.5, offsetX: 25, offsetY: -40 },
      }),
    );
  });

  it('keeps only the latest composition render when slider changes overlap an active render', async () => {
    vi.useFakeTimers();
    let resolveFirstRender: ((value: {
      blob: Blob;
      previewUrl: string;
      theme: Awaited<ReturnType<typeof mocks.analyzeImage>>;
    }) => void) | undefined;
    mocks.renderFramedImage.mockImplementationOnce(
      ({ theme }) =>
        new Promise((resolve) => {
          resolveFirstRender = () =>
            resolve({
              blob: new Blob(['stale'], { type: 'image/png' }),
              previewUrl: 'blob:stale-composition',
              theme,
            });
        }),
    );
    mocks.renderFramedImage.mockImplementation(async ({ photoTransform, theme }) => ({
      blob: new Blob([`latest-${photoTransform.offsetX}`], { type: 'image/png' }),
      previewUrl: `blob:latest-${photoTransform.offsetX}`,
      theme,
    }));

    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '10' } });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '40' } });
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '70' } });

    await act(async () => {
      resolveFirstRender?.({
        blob: new Blob(['stale'], { type: 'image/png' }),
        previewUrl: 'blob:stale-composition',
        theme: {
          dominantColor: '#9f7355',
          frameColor: '#9f7355',
          textColor: '#fffaf1',
          surfaceColor: '#efe1ce',
          palette: ['#9f7355', '#335577', '#d9b46f'],
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2);
    expect(mocks.renderFramedImage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        photoTransform: { scale: 1, offsetX: 70, offsetY: 0 },
      }),
    );
    expect(screen.getByRole('img', { name: /a\.png/i })).toHaveAttribute('src', 'blob:latest-70');
  });

  it('ignores stale composition render failures when a newer slider value is queued', async () => {
    vi.useFakeTimers();
    let rejectFirstRender: ((reason?: unknown) => void) | undefined;
    mocks.renderFramedImage.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirstRender = reject;
        }),
    );
    mocks.renderFramedImage.mockImplementation(async ({ photoTransform, theme }) => ({
      blob: new Blob([`latest-${photoTransform.offsetY}`], { type: 'image/png' }),
      previewUrl: `blob:latest-y-${photoTransform.offsetY}`,
      theme,
    }));

    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByTestId('photo-offset-y-input'), { target: { value: '-10' } });

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(screen.getByTestId('photo-offset-y-input'), { target: { value: '-60' } });

    await act(async () => {
      rejectFirstRender?.(new Error('stale render failed'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('img', { name: /a\.png/i })).toHaveAttribute('src', 'blob:latest-y--60');
    expect(screen.queryByText(/stale render failed/i)).not.toBeInTheDocument();
  });

  it('keeps an in-flight composition render for one photo when another photo queues a render', async () => {
    mocks.renderFramedImage.mockImplementation(async ({ file, theme }) => ({
      blob: new Blob([`initial-${file.name}`], { type: 'image/png' }),
      previewUrl: `blob:initial-${file.name}`,
      theme,
    }));
    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: {
        files: [
          new File(['image-a'], 'a.png', { type: 'image/png' }),
          new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
        ],
      },
    });
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));

    let resolveFirstComposition: ((value: {
      blob: Blob;
      previewUrl: string;
      theme: Awaited<ReturnType<typeof mocks.analyzeImage>>;
    }) => void) | undefined;
    mocks.renderFramedImage.mockImplementationOnce(
      ({ theme }) =>
        new Promise((resolve) => {
          resolveFirstComposition = () =>
            resolve({
              blob: new Blob(['a-composed'], { type: 'image/png' }),
              previewUrl: 'blob:a-composed',
              theme,
            });
        }),
    );
    mocks.renderFramedImage.mockImplementation(async ({ file, photoTransform, theme }) => ({
      blob: new Blob([`${file.name}-${photoTransform.offsetX}`], { type: 'image/png' }),
      previewUrl: `blob:${file.name}-${photoTransform.offsetX}`,
      theme,
    }));

    fireEvent.click(screen.getByRole('button', { name: /^a\.png/i }));
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '10' } });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: /^b\.jpg/i }));
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '20' } });

    await act(async () => {
      resolveFirstComposition?.({
        blob: new Blob(['a-composed'], { type: 'image/png' }),
        previewUrl: 'blob:a-composed',
        theme: {
          dominantColor: '#9f7355',
          frameColor: '#9f7355',
          textColor: '#fffaf1',
          surfaceColor: '#efe1ce',
          palette: ['#9f7355', '#335577', '#d9b46f'],
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByRole('button', { name: /^a\.png/i }));

    expect(screen.getByRole('img', { name: /a\.png/i })).toHaveAttribute('src', 'blob:a-composed');
  });

  it('keeps queued composition renders for each edited photo', async () => {
    mocks.renderFramedImage.mockImplementation(async ({ file, theme }) => ({
      blob: new Blob([`initial-${file.name}`], { type: 'image/png' }),
      previewUrl: `blob:initial-${file.name}`,
      theme,
    }));
    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: {
        files: [
          new File(['image-a'], 'a.png', { type: 'image/png' }),
          new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
        ],
      },
    });
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));

    let resolveActiveRender: ((value: {
      blob: Blob;
      previewUrl: string;
      theme: Awaited<ReturnType<typeof mocks.analyzeImage>>;
    }) => void) | undefined;
    mocks.renderFramedImage.mockImplementationOnce(
      ({ theme }) =>
        new Promise((resolve) => {
          resolveActiveRender = () =>
            resolve({
              blob: new Blob(['a-first'], { type: 'image/png' }),
              previewUrl: 'blob:a-first',
              theme,
            });
        }),
    );
    mocks.renderFramedImage.mockImplementation(async ({ file, photoTransform, theme }) => ({
      blob: new Blob([`${file.name}-${photoTransform.offsetX}`], { type: 'image/png' }),
      previewUrl: `blob:${file.name}-${photoTransform.offsetX}`,
      theme,
    }));

    fireEvent.click(screen.getByRole('button', { name: /^a\.png/i }));
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '10' } });

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: /^b\.jpg/i }));
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /^a\.png/i }));
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '30' } });

    await act(async () => {
      resolveActiveRender?.({
        blob: new Blob(['a-first'], { type: 'image/png' }),
        previewUrl: 'blob:a-first',
        theme: {
          dominantColor: '#9f7355',
          frameColor: '#9f7355',
          textColor: '#fffaf1',
          surfaceColor: '#efe1ce',
          palette: ['#9f7355', '#335577', '#d9b46f'],
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(5));

    fireEvent.click(screen.getByRole('button', { name: /^a\.png/i }));
    expect(screen.getByRole('img', { name: /a\.png/i })).toHaveAttribute('src', 'blob:a.png-30');

    fireEvent.click(screen.getByRole('button', { name: /^b\.jpg/i }));
    expect(screen.getByRole('img', { name: /b\.jpg/i })).toHaveAttribute('src', 'blob:b.jpg-20');
  });

  it('keeps composition settings local to the selected photo and resets them', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByTestId('photo-upload'), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /^a\.png/i }));
    fireEvent.change(screen.getByTestId('photo-scale-input'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByTestId('photo-offset-x-input'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('photo-offset-y-input'), { target: { value: '-20' } });

    expect(screen.getByTestId('photo-scale-input')).toHaveValue('0.5');
    expect(screen.getByTestId('photo-offset-x-input')).toHaveValue('60');
    expect(screen.getByTestId('photo-offset-y-input')).toHaveValue('-20');

    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));

    expect(screen.getByTestId('photo-scale-input')).toHaveValue('1');
    expect(screen.getByTestId('photo-offset-x-input')).toHaveValue('0');
    expect(screen.getByTestId('photo-offset-y-input')).toHaveValue('0');

    await user.click(screen.getByRole('button', { name: /^a\.png/i }));
    await user.click(screen.getByTestId('photo-transform-reset'));

    expect(screen.getByTestId('photo-scale-input')).toHaveValue('1');
    expect(screen.getByTestId('photo-offset-x-input')).toHaveValue('0');
    expect(screen.getByTestId('photo-offset-y-input')).toHaveValue('0');
  });

  it('keeps composition offsets unchanged when dragging the preview', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByTestId('photo-upload'), {
      target: { files: [new File(['image-a'], 'a.png', { type: 'image/png' })] },
    });
    const previewCanvas = screen.getByTestId('preview-canvas');
    fireEvent.pointerDown(previewCanvas, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(previewCanvas, { clientX: 130, clientY: 80, pointerId: 1 });

    expect(screen.getByTestId('photo-offset-x-input')).toHaveValue('0');
    expect(screen.getByTestId('photo-offset-y-input')).toHaveValue('0');

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledTimes(1);
    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        photoTransform: { scale: 1, offsetX: 0, offsetY: 0 },
      }),
    );
  });
});
