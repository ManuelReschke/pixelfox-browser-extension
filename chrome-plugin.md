# PixelFox Browser Extension for Chrome, Brave, and Chromium

## Goal

There should be an official browser extension that lets users quickly upload
images and screenshots to PixelFox. The most important feature is a rectangular
screenshot selection from the currently visible page. After upload, the
extension should show the PixelFox share link and make it easy to copy.

The extension is a dedicated PixelFox client and should preferably live in a
separate repository, for example `pixelfox-browser-extension`. The PixelFox
application repository remains responsible for API, auth, OpenAPI
documentation, and server-side changes.

## MVP Features

- Chrome/Brave/Chromium extension based on Manifest V3.
- Settings page for:
  - PixelFox API key.
  - PixelFox base URL, defaulting to `https://pixelfox.cc`.
  - Optional: mark upload as NSFW.
  - Optional: processing profile, for example `default` or `original_only`.
- Store the API key locally, show it masked, and never log it.
- Popup with actions for `Capture visible area` and `Select area`.
- The settings action is available as a gear icon in the popup header.
- After clicking a screenshot action:
  - Capture the active tab.
  - For `Select area`, show a content-script overlay.
  - Let the user drag a rectangular area when selection mode is used.
  - `Esc` cancels selection mode.
  - Crop the selected area from the screenshot, or keep the full visible viewport.
  - Show the prepared image in a result window as a preview.
- From the result window:
  - `Edit` opens a lightweight annotation editor for red arrows, circles, and
    text before upload.
  - `Upload & Copy Link` starts the upload and copies the resulting share link.
  - `Open Link` opens the link after upload.
- After a successful upload:
  - Show the share link.
  - Automatically copy the share link to the clipboard where possible.
  - Allow opening the link.
- Additional low-effort feature:
  - File upload from the popup, so screenshots are not the only upload path.

## Upload Flow Against the PixelFox API

The extension should use the existing public API, not session cookies or private
webapp endpoints.

1. Read the API key from extension storage.
2. Optionally call `GET /api/v1/user/profile` with header `X-API-Key` first to
   verify key validity, limits, and enabled upload features.
3. Create a `Blob`/`File` from the visible viewport or screenshot crop and
   determine file size.
4. Show the prepared image as a preview before uploading.
5. Create an upload session after user confirmation:
   - `POST /api/v1/upload/sessions`
   - Header: `X-API-Key: <API_KEY>`
   - JSON body at least: `{ "file_size": <bytes> }`
   - Optional: `is_nsfw`
   - Optional: `processing`
6. Upload the file to `upload_url` from the session:
   - Multipart field `file`
   - Header: `Authorization: Bearer <UPLOAD_TOKEN>`
7. Evaluate the response:
   - `image_uuid`
   - `view_url`
   - `url`
   - `duplicate`
8. If processing is not finished yet:
   - Poll `GET /api/v1/images/{uuid}/status`.
   - Show an error if `failed=true`.
9. Fetch the final resource:
   - `GET /api/v1/images/{uuid}`
   - Prefer building the share link from `view_url`.
   - If `view_url` is relative, resolve it against the configured PixelFox base
     URL.

## Technical Notes for the Extension

- Keep manifest permissions as small as possible:
  - `activeTab`
  - `scripting`
  - `storage`
  - `clipboardWrite`, if needed for copying.
- Host permissions for `https://pixelfox.cc/*`.
- Custom base URLs for local/dev instances need matching host permissions in
  the development build or a clear UI restriction.
- `chrome.tabs.captureVisibleTab` captures only the visible viewport. That is
  sufficient for the MVP.
- Cropping must account for `devicePixelRatio`, otherwise selection is shifted
  or incorrectly scaled on Retina/HiDPI displays.
- Pages such as `chrome://...`, Chrome Web Store, or internal browser pages
  cannot be screenshotted, or only with restrictions. Show a clear error.
- Prefer TypeScript later so API responses and extension messages can be typed
  cleanly.
- Do not store API keys in query strings, console logs, error telemetry, or
  persisted upload history.

## UX Requirements

- Setup must clearly show whether an API key is saved.
- The key can be validated, for example through `GET /api/v1/user/profile`.
- Missing or invalid API key leads directly to a prompt to open settings.
- Show upload status:
  - Preparing screenshot.
  - Preview ready.
  - Creating upload session.
  - Uploading file.
  - Processing image.
  - Link ready.
- Show understandable errors:
  - API key missing/invalid.
  - Uploads disabled server-side.
  - File is too large.
  - File type is not accepted.
  - Rate limit.
  - Network error.
  - Processing failed.
  - Current page cannot be captured.

## MVP Acceptance Criteria

- Extension can be installed as an unpacked extension in Chrome.
- API key can be saved, shown masked, validated, and deleted.
- On a normal web page, the visible viewport can be captured.
- On a normal web page, a rectangle can be selected.
- The selected area is cropped correctly, including on HiDPI/Retina displays.
- The result window shows a preview before upload.
- The preview can be annotated with red arrows, circles, and text before upload.
- Upload uses `POST /api/v1/upload/sessions` and then `upload_url` after confirmation.
- After a successful upload, a valid PixelFox share link appears.
- The share link can be copied and opened.
- Cancelling with `Esc` does not start an upload.
- Errors are handled visibly in the extension.

## Not in the MVP

- Full-page screenshots with scroll stitching.
- Screenshot editor with arrows, text, blur, or annotations.
- Login/OAuth inside the extension.
- Firefox version.
- Full upload history.
- Album picker.
- Context menu entry.
- Drag-and-drop upload from arbitrary web pages.

## Resolved Questions

- The extension supports PixelFox and restricted local development URLs.
- The NSFW option is visible in settings.
- The default processing profile is `original_only`, with `default` available
  as an option.
- The extension is intended for future Chrome Web Store publication, so privacy
  policy, store description, screenshots, and permission justification should be
  planned.
- API calls run from extension contexts with host permissions. Content scripts
  do not call the API directly.
