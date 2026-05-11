# ColorFrame

ColorFrame is a pure frontend photo framing tool. It analyzes uploaded photos locally in the browser, extracts a theme color for each image, applies a matching frame and text, and exports processed images.

## Features

- Single and batch photo upload
- Per-image theme color extraction
- Canvas-based frame and text rendering
- Batch queue with progress, cancel, and failure isolation
- Desktop ZIP export
- Mobile share/save first, ZIP fallback
- Responsive desktop and mobile layout

Photos stay on the device and are not uploaded to a server.

## Development

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/.

## Fonts

Default caption text uses bundled Isenheim for Latin text, then local Songti-compatible fonts for Chinese text. Isenheim is distributed under the SIL Open Font License 1.1; the license copy lives at `src/assets/fonts/Isenheim-LICENSE.txt`.

## Verification

```bash
npm test
npm run build
npm run e2e
```
