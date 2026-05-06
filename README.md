# PixelFox Browser Extension

Manifest V3 extension for Chrome, Brave, and Chromium to upload screenshots and image files to PixelFox.

## Load Locally

1. Open `chrome://extensions` in Chrome.
2. Enable Developer Mode.
3. Choose `Load unpacked` and select this repository.
4. Open the extension settings and save API key, base URL, and upload defaults.

For the local PixelFox instance, `http://localhost:8080` is available as an allowed development base URL. Chrome asks for an optional host permission when saving it.

## CORS Note

API requests run from extension contexts: popup, options page, or service worker. With matching `host_permissions`, those contexts can send cross-origin requests to PixelFox. The content script only renders the selection overlay and does not call the API directly.

## MVP Scope

- Store the API key locally, show it masked, validate it, and delete it.
- Base URL for `https://pixelfox.cc`, `http://localhost:8080`, or `http://127.0.0.1:8080`.
- Optional NSFW flag.
- Processing profile `original_only` by default, `default` as an option.
- Optional album ID for upload sessions.
- Capture the visible viewport directly or select a rectangle with an overlay, and crop correctly on HiDPI displays.
- Show a screenshot preview before upload.
- Create an upload session after confirmation, upload the file through multipart form data, poll status, and show/copy the share link.
- Direct file upload from the popup.
- Show the three most recent uploads in the popup with icon-only copy buttons.
- Show a compact PixelFox Premium prompt for users on the free plan.
