import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function createTestPng(page: Page) {
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 72;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('missing canvas context');
    }

    context.fillStyle = '#b6673b';
    context.fillRect(0, 0, 96, 72);
    context.fillStyle = '#1d3f57';
    context.fillRect(48, 0, 48, 72);

    return canvas.toDataURL('image/png').split(',')[1];
  });

  return Buffer.from(imageBase64, 'base64');
}

async function createTallMagentaPng(page: Page) {
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 600;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('missing canvas context');
    }

    context.fillStyle = '#ff00cc';
    context.fillRect(0, 0, 400, 600);

    return canvas.toDataURL('image/png').split(',')[1];
  });

  return Buffer.from(imageBase64, 'base64');
}

async function uploadImages(page: Page, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
  await page.getByTestId('photo-upload').setInputFiles(files);
}

function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name === 'mobile-chrome';
}

async function expectGeneratedExportReady(page: Page, testInfo: TestInfo, desktopDownloadCount?: number) {
  if (isMobileProject(testInfo)) {
    await expect(page.getByRole('button', { name: '保存/分享图片' })).toBeEnabled({ timeout: 10000 });
    await expect(page.getByTestId('download-current')).toHaveCount(0);
    await expect(page.locator('.icon-download')).toHaveCount(0);
    return;
  }

  if (typeof desktopDownloadCount === 'number') {
    await expect(page.locator('.icon-download')).toHaveCount(desktopDownloadCount, { timeout: 10000 });
    return;
  }

  await expect(page.getByTestId('download-current')).toBeEnabled({ timeout: 10000 });
}

test('loads the ColorFrame workspace', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'ColorFrame' })).toBeVisible();
  await expect(page.getByTestId('photo-upload')).toBeAttached();
  await expect(page.getByTestId('process-batch')).toBeVisible();
});

test('defaults to unified text with separate caption size controls', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: '文件名' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '统一文字' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('统一文字')).toHaveValue('请输入文本');
  await expect(page.getByLabel('中文字号')).toHaveValue('14');
  await expect(page.getByLabel('英文字号')).toHaveValue('14');

  await page.getByLabel('中文字号').fill('18');
  await page.getByLabel('英文字号').fill('22');

  await expect(page.getByLabel('中文字号')).toHaveValue('18');
  await expect(page.getByLabel('英文字号')).toHaveValue('22');
});

test('auto processes multiple uploaded images', async ({ page }, testInfo) => {
  await page.goto('/');

  const image = await createTestPng(page);
  await uploadImages(page, [
    { name: 'first.png', mimeType: 'image/png', buffer: image },
    { name: 'second.png', mimeType: 'image/png', buffer: image },
  ]);

  await expect(page.getByRole('button', { name: /^first\.png/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^second\.png/ })).toBeVisible();
  await expectGeneratedExportReady(page, testInfo, 2);
});

test('processes a real image through the default batch flow', async ({ page }, testInfo) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'palette.png', mimeType: 'image/png', buffer: await createTestPng(page) }]);
  await page.getByTestId('process-batch').click();

  await expectGeneratedExportReady(page, testInfo, 1);
});

test('auto generates a default preview after upload', async ({ page }, testInfo) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'default.png', mimeType: 'image/png', buffer: await createTestPng(page) }]);

  await expectGeneratedExportReady(page, testInfo);
});

test('clips the lower photo so it cannot cover stacked text area', async ({ page }, testInfo) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'tall.png', mimeType: 'image/png', buffer: await createTallMagentaPng(page) }]);
  await expectGeneratedExportReady(page, testInfo);
  await page.getByTestId('frame-color-000000').click();

  await page.waitForFunction(
    () => {
      const image = document.querySelector('.preview-canvas img');
      if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth || !image.naturalHeight) {
        return false;
      }

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        return false;
      }

      context.drawImage(image, 0, 0);
      const [red, green, blue] = context.getImageData(12, Math.round(image.naturalHeight * 0.35), 1, 1).data;
      return red < 8 && green < 8 && blue < 8;
    },
    undefined,
    { timeout: 10000 },
  );
});

test('stores custom text per selected photo', async ({ page }) => {
  await page.goto('/');

  await uploadImages(page, [
    { name: 'first.png', mimeType: 'image/png', buffer: Buffer.from('not-a-real-image') },
    { name: 'second.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not-a-real-image') },
  ]);

  await page.getByRole('button', { name: /^first\.png/ }).click();
  await page.getByTestId('photo-text-input').fill('First caption');
  await page.getByRole('button', { name: /^second\.jpg/ }).click();
  await page.getByTestId('photo-text-input').fill('Second caption');
  await page.getByRole('button', { name: /^first\.png/ }).click();

  await expect(page.getByTestId('photo-text-input')).toHaveValue('First caption');
});

test('switches layout, palette color, and frame style', async ({ page }) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'first.png', mimeType: 'image/png', buffer: Buffer.from('not-a-real-image') }]);

  await expect(page.getByTestId('frame-layout-stacked')).toHaveAttribute('aria-pressed', 'true');
  expect(Number(await page.getByTestId('top-block-ratio-input').inputValue())).toBeCloseTo(7 / 9, 12);
  await expect(page.getByTestId('frame-color-ffffff')).toBeVisible();
  await expect(page.getByTestId('frame-color-000000')).toBeVisible();

  await page.getByTestId('frame-color-335577').click();
  await page.getByTestId('frame-layout-surround').click();
  await page.getByTestId('frame-style-blur').click();
  await page.getByTestId('frame-color-000000').click();

  await expect(page.getByTestId('frame-layout-surround')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('frame-style-blur')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('frame-color-000000')).toHaveAttribute('aria-pressed', 'true');
});

test('auto regenerates the selected image after editing text', async ({ page }, testInfo) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'auto.png', mimeType: 'image/png', buffer: await createTestPng(page) }]);
  await page.getByTestId('photo-text-input').fill('Auto caption');

  await expectGeneratedExportReady(page, testInfo);
});

test('adjusts the selected image composition with sliders', async ({ page }, testInfo) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'compose.png', mimeType: 'image/png', buffer: await createTestPng(page) }]);
  await page.getByTestId('photo-scale-input').evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = '1.5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByTestId('photo-offset-x-input').evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByTestId('photo-offset-y-input').evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = '-20';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(page.getByTestId('photo-scale-input')).toHaveValue('1.5');
  await expect(page.getByTestId('photo-offset-x-input')).toHaveValue('30');
  await expect(page.getByTestId('photo-offset-y-input')).toHaveValue('-20');
  await expectGeneratedExportReady(page, testInfo);
});

test('downloads the currently selected image', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Current-image downloads are desktop-only.');

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => false,
    });
  });
  await page.goto('/');

  const image = await createTestPng(page);
  await uploadImages(page, [
    { name: 'first.png', mimeType: 'image/png', buffer: image },
    { name: 'second.png', mimeType: 'image/png', buffer: image },
  ]);

  await page.getByRole('button', { name: /^second\.png/ }).click();
  await expect(page.getByTestId('download-current')).toBeEnabled({ timeout: 10000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-current').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('second_colorframe.png');
});

test('mobile export controls only show process and share actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    });
  });
  await page.goto('/');

  await uploadImages(page, [
    { name: 'mobile-first.png', mimeType: 'image/png', buffer: await createTestPng(page) },
    { name: 'mobile-second.png', mimeType: 'image/png', buffer: await createTestPng(page) },
  ]);

  await expect(page.getByRole('button', { name: '保存/分享图片' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('process-batch')).toBeVisible();
  await expect(page.getByTestId('download-current')).toHaveCount(0);
  await expect(page.getByTestId('download-batch')).toHaveCount(0);
  await expect(page.locator('.icon-download')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下载 ZIP' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '取消' })).toHaveCount(0);
});
