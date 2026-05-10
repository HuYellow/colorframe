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
        template: expect.objectContaining({ frameStyle: 'blur', textMode: 'filename' }),
      }),
    );
    expect(mocks.renderFramedImage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        file: expect.objectContaining({ name: 'b.jpg' }),
        template: expect.objectContaining({ frameStyle: 'blur', textMode: 'filename' }),
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

  it('offers smart text mode and renders with the generated suggestion', async () => {
    vi.useFakeTimers();
    mocks.createSmartCaption.mockResolvedValueOnce({
      suggestedText: '把 garden walk 的颜色留在这一刻',
      captionStatus: 'ready',
      metadataSummary: { hasGps: false },
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText(/选择照片/i), {
      target: { files: [new File(['image-a'], 'garden_walk.png', { type: 'image/png' })] },
    });

    expect(screen.getByRole('button', { name: /智能建议/i })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.createSmartCaption).toHaveBeenCalledWith(expect.objectContaining({ name: 'garden_walk.png' }));
    fireEvent.click(screen.getByRole('button', { name: /智能建议/i }));

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mocks.renderFramedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: 'garden_walk.png' }),
        template: expect.objectContaining({ textMode: 'smart' }),
        suggestedText: '把 garden walk 的颜色留在这一刻',
      }),
    );
    expect(screen.getByText(/智能建议：把 garden walk 的颜色留在这一刻/i)).toBeInTheDocument();
  });

  it('lets the selected photo store a chosen palette color and fixed black or white colors', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [new File(['image-a'], 'a.png', { type: 'image/png' })]);
    expect(screen.getByRole('button', { name: /选择色框颜色 #ffffff/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择色框颜色 #000000/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /选择色框颜色 #335577/i }));

    expect(screen.getByRole('button', { name: /选择色框颜色 #335577/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/色框颜色：#335577/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /选择色框颜色 #ffffff/i }));

    expect(screen.getByRole('button', { name: /选择色框颜色 #ffffff/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/色框颜色：#ffffff/i)).toBeInTheDocument();
  });

  it('lets users switch between solid and blur frame modes', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('button', { name: /高斯模糊/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /纯色/i }));

    expect(screen.getByRole('button', { name: /纯色/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps frame ratio, corner radius, and frame mode local to the selected photo', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText(/选择照片/i), [
      new File(['image-a'], 'a.png', { type: 'image/png' }),
      new File(['image-b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(mocks.renderFramedImage).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /^a\.png/i }));
    fireEvent.change(screen.getByLabelText(/边框比例/i), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText(/圆角比例/i), { target: { value: '0.04' } });
    await user.click(screen.getByRole('button', { name: /纯色/i }));

    expect(screen.getByLabelText(/边框比例/i)).toHaveValue('0.1');
    expect(screen.getByLabelText(/圆角比例/i)).toHaveValue('0.04');
    expect(screen.getByRole('button', { name: /纯色/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));

    expect(screen.getByLabelText(/边框比例/i)).toHaveValue('0.07');
    expect(screen.getByLabelText(/圆角比例/i)).toHaveValue('0.025');
    expect(screen.getByRole('button', { name: /高斯模糊/i })).toHaveAttribute('aria-pressed', 'true');
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
    fireEvent.change(screen.getByLabelText(/边框比例/i), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText(/圆角比例/i), { target: { value: '0.04' } });
    await user.click(screen.getByRole('button', { name: /纯色/i }));
    await user.click(screen.getByRole('button', { name: /应用当前/i }));
    await user.click(screen.getByRole('button', { name: /^b\.jpg/i }));

    expect(screen.getByLabelText(/边框比例/i)).toHaveValue('0.1');
    expect(screen.getByLabelText(/圆角比例/i)).toHaveValue('0.04');
    expect(screen.getByRole('button', { name: /纯色/i })).toHaveAttribute('aria-pressed', 'true');
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

  it('uses the selected-photo download path for mobile browsers that cannot share files', async () => {
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
    await user.click(screen.getByRole('button', { name: /逐张下载/i }));

    expect(shareSpy).not.toHaveBeenCalled();
    expect(downloadClick).toHaveBeenCalledTimes(1);
    expect(lastCreatedAnchor).toHaveAttribute('download', 'b_colorframe.png');
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
        template: expect.objectContaining({ frameStyle: 'blur', textMode: 'filename' }),
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
});
