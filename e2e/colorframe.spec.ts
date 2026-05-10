import { expect, test, type Page } from '@playwright/test';

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

async function uploadImages(page: Page, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
  await page.getByTestId('photo-upload').setInputFiles(files);
}

test('loads the ColorFrame workspace', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'ColorFrame' })).toBeVisible();
  await expect(page.getByTestId('photo-upload')).toBeAttached();
  await expect(page.getByTestId('process-batch')).toBeVisible();
});

test('auto processes multiple uploaded images', async ({ page }) => {
  await page.goto('/');

  const image = await createTestPng(page);
  await uploadImages(page, [
    { name: 'first.png', mimeType: 'image/png', buffer: image },
    { name: 'second.png', mimeType: 'image/png', buffer: image },
  ]);

  await expect(page.getByRole('button', { name: /^first\.png/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^second\.png/ })).toBeVisible();
  await expect(page.locator('.icon-download')).toHaveCount(2, { timeout: 10000 });
});

test('processes a real image through the default batch flow', async ({ page }) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'palette.png', mimeType: 'image/png', buffer: await createTestPng(page) }]);
  await page.getByTestId('process-batch').click();

  await expect(page.locator('.icon-download')).toHaveCount(1, { timeout: 10000 });
});

test('auto generates a default preview after upload', async ({ page }) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'default.png', mimeType: 'image/png', buffer: await createTestPng(page) }]);

  await expect(page.getByTestId('download-current')).toBeEnabled({ timeout: 10000 });
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

test('switches palette color and frame style', async ({ page }) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'first.png', mimeType: 'image/png', buffer: Buffer.from('not-a-real-image') }]);

  await expect(page.getByTestId('frame-style-blur')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('frame-color-ffffff')).toBeVisible();
  await expect(page.getByTestId('frame-color-000000')).toBeVisible();

  await page.getByTestId('frame-color-335577').click();
  await page.getByTestId('frame-style-solid').click();
  await page.getByTestId('frame-color-000000').click();

  await expect(page.getByTestId('frame-style-solid')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('frame-color-000000')).toHaveAttribute('aria-pressed', 'true');
});

test('auto regenerates the selected image after editing text', async ({ page }) => {
  await page.goto('/');

  await uploadImages(page, [{ name: 'auto.png', mimeType: 'image/png', buffer: await createTestPng(page) }]);
  await page.getByTestId('photo-text-input').fill('Auto caption');

  await expect(page.getByTestId('download-current')).toBeEnabled({ timeout: 10000 });
});

test('downloads the currently selected image', async ({ page }) => {
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
