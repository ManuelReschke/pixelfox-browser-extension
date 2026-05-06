import { hasOriginPermission, loadSettings } from "./shared/config.js";
import { deletePendingUpload, getPendingUpload, savePendingUpload } from "./shared/pendingUploads.js";
import { uploadPixelFoxFile } from "./shared/pixelfoxApi.js";
import { addRecentUpload } from "./shared/recentUploads.js";

const JOB_KEY = "latestJob";

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PIXELFOX_PREPARE_SCREENSHOT") {
    prepareScreenshotFlow(message.mode).catch((error) => {
      openResultWindow().catch(() => {});
      chrome.action.setBadgeText({ text: "!" });
      setJob({
        state: "error",
        phase: "error",
        message: error.message || "Screenshot could not be prepared."
      });
    });

    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "PIXELFOX_UPLOAD_PENDING") {
    uploadPendingFlow(message.pendingUploadId).catch((error) => {
      chrome.action.setBadgeText({ text: "!" });
      setJob({
        state: "error",
        phase: "error",
        message: error.message || "Upload failed."
      });
    });

    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function prepareScreenshotFlow(mode = "selection") {
  await setJob({
    source: "screenshot",
    state: "running",
    phase: "preparing",
    message: "Preparing screenshot.",
    shareUrl: "",
    imageUuid: "",
    pendingUploadId: "",
    error: ""
  });

  chrome.action.setBadgeText({ text: "" });

  const settings = await loadSettings();
  if (!settings.apiKey) {
    throw new Error("Please save a PixelFox API key in settings first.");
  }

  if (!(await hasOriginPermission(settings.baseUrl))) {
    throw new Error("The host permission for this PixelFox base URL is missing. Open settings and save again.");
  }

  const tab = await getActiveTab();
  assertCapturableTab(tab);

  await setJob({ phase: "capturing", message: "Capturing active tab." });
  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  });

  let screenshotBlob = dataUrlToBlob(screenshotDataUrl);
  let source = "visible";
  let title = "Visible area";

  if (mode !== "visible") {
    await setJob({ phase: "selecting", message: "Select an area on the page." });
    await injectSelectionOverlay(tab.id);
    const selection = await requestSelection(tab.id);

    if (selection.cancelled) {
      await setJob({
        state: "cancelled",
        phase: "cancelled",
        message: "Selection cancelled."
      });
      return;
    }

    await setJob({ phase: "cropping", message: "Cropping selection." });
    screenshotBlob = await cropScreenshot(screenshotDataUrl, selection);
    source = "screenshot";
    title = "Screenshot selection";
  }

  const pendingUpload = await savePendingUpload({
    blob: screenshotBlob,
    filename: `pixelfox-screenshot-${timestampSlug()}.png`,
    source
  });

  await setJob({
    source,
    state: "pending",
    phase: "preview",
    message: "Review the preview, then upload when ready.",
    pendingUploadId: pendingUpload.id,
    pendingTitle: title,
    pendingSize: pendingUpload.size,
    shareUrl: "",
    imageUuid: ""
  });

  await openResultWindow();
}

async function uploadPendingFlow(pendingUploadId) {
  await setJob({
    state: "running",
    phase: "preparing",
    message: "Preparing upload."
  });

  chrome.action.setBadgeText({ text: "..." });

  const settings = await loadSettings();
  if (!settings.apiKey) {
    throw new Error("Please save a PixelFox API key in settings first.");
  }

  if (!(await hasOriginPermission(settings.baseUrl))) {
    throw new Error("The host permission for this PixelFox base URL is missing. Open settings and save again.");
  }

  const pendingUpload = await getPendingUpload(pendingUploadId);
  if (!pendingUpload?.blob) {
    throw new Error("The prepared screenshot is no longer available. Capture it again.");
  }

  const file = new File([pendingUpload.blob], pendingUpload.filename || `pixelfox-screenshot-${timestampSlug()}.png`, {
    type: pendingUpload.mimeType || pendingUpload.blob.type || "image/png"
  });

  const result = await uploadPixelFoxFile(file, settings, (phase, message) => {
    setJob({ phase, message });
  });
  const imageUuid = result.image?.image_uuid || result.uploadResult?.image_uuid || "";

  await addRecentUpload({
    shareUrl: result.shareUrl,
    imageUuid,
    title: pendingUpload.source === "visible" ? "Visible area" : "Screenshot selection",
    source: pendingUpload.source === "visible" ? "screenshot" : pendingUpload.source,
    duplicate: result.duplicate
  });

  await deletePendingUpload(pendingUploadId);

  await setJob({
    state: "complete",
    phase: "complete",
    message: result.duplicate ? "Link ready. Existing link copied." : "Link ready. Copied to clipboard.",
    shareUrl: result.shareUrl,
    imageUuid,
    pendingUploadId,
    pendingTitle: pendingUpload.source === "visible" ? "Visible area" : "Screenshot selection"
  });

  chrome.action.setBadgeText({ text: "OK" });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (!tabs.length) {
    throw new Error("No active tab found.");
  }

  return tabs[0];
}

function assertCapturableTab(tab) {
  const url = tab?.url || "";

  if (!tab?.id || !url) {
    throw new Error("The current tab cannot be captured.");
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("This browser page cannot be captured. Open a regular web page.");
  }
}

async function injectSelectionOverlay(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["src/content/selectionOverlay.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content/selectionOverlay.js"]
  });
}

async function requestSelection(tabId) {
  return chrome.tabs.sendMessage(tabId, {
    type: "PIXELFOX_SELECT_AREA"
  });
}

async function openResultWindow() {
  const existing = await chrome.storage.session.get("resultWindowId");

  if (existing.resultWindowId) {
    try {
      await chrome.windows.update(existing.resultWindowId, {
        focused: true,
        width: 460,
        height: 620
      });
      return;
    } catch {
      await chrome.storage.session.remove("resultWindowId");
    }
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("result.html"),
    type: "popup",
    width: 460,
    height: 620,
    focused: true
  });

  if (win?.id) {
    await chrome.storage.session.set({ resultWindowId: win.id });
  }
}

async function cropScreenshot(dataUrl, selection) {
  const imageBlob = dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(imageBlob);
  const rect = selection.rect;
  const viewport = selection.viewport;
  const scaleX = bitmap.width / viewport.width;
  const scaleY = bitmap.height / viewport.height;
  const sourceX = clamp(Math.round(rect.x * scaleX), 0, bitmap.width);
  const sourceY = clamp(Math.round(rect.y * scaleY), 0, bitmap.height);
  const sourceWidth = clamp(Math.round(rect.width * scaleX), 1, bitmap.width - sourceX);
  const sourceHeight = clamp(Math.round(rect.height * scaleY), 1, bitmap.height - sourceY);
  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext("2d");

  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

async function setJob(patch) {
  const current = await chrome.storage.session.get(JOB_KEY);
  const next = {
    ...(current[JOB_KEY] || {}),
    ...patch,
    updatedAt: Date.now()
  };

  await chrome.storage.session.set({ [JOB_KEY]: next });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
