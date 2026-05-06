import { ensureOriginPermission, hasOriginPermission, loadSettings } from "./src/shared/config.js";
import { uploadPixelFoxFile, validateApiKey } from "./src/shared/pixelfoxApi.js";
import { addRecentUpload, getRecentUploads } from "./src/shared/recentUploads.js";

const visibleAreaButton = document.getElementById("visibleAreaButton");
const selectionButton = document.getElementById("selectionButton");
const fileButton = document.getElementById("fileButton");
const fileInput = document.getElementById("fileInput");
const settingsButton = document.getElementById("settingsButton");
const uploadStatus = document.getElementById("uploadStatus");
const recentUploadsList = document.getElementById("recentUploadsList");
const emptyRecentUploads = document.getElementById("emptyRecentUploads");
const premiumPromo = document.getElementById("premiumPromo");

let settings = null;

init();

async function init() {
  settings = await loadSettings();
  applySettingsState();
  await renderRecentUploads();
  renderPremiumPromo();

  visibleAreaButton.addEventListener("click", () => startScreenshot("visible"));
  selectionButton.addEventListener("click", () => startScreenshot("selection"));
  fileButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", uploadSelectedFile);
  settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  recentUploadsList.addEventListener("click", copyRecentUpload);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.recentUploads) {
      renderRecentUploads();
    }
  });
}

function applySettingsState() {
  if (!settings.apiKey) {
    visibleAreaButton.disabled = true;
    selectionButton.disabled = true;
    fileButton.disabled = true;
    return;
  }
}

async function startScreenshot(mode) {
  try {
    setBusy(true);
    setStatus(mode === "visible" ? "Capturing visible area." : "Starting area selection.");
    const permissionGranted = await ensureOriginPermission(settings.baseUrl);

    if (!permissionGranted) {
      throw new Error("Host permission for this base URL was not granted.");
    }

    await chrome.runtime.sendMessage({
      type: "PIXELFOX_PREPARE_SCREENSHOT",
      mode
    });
    window.close();
  } catch (error) {
    setBusy(false);
    setStatus(error.message || "Screenshot could not be started.");
  }
}

async function uploadSelectedFile() {
  const file = fileInput.files?.[0];
  fileInput.value = "";

  if (!file) {
    return;
  }

  try {
    setBusy(true);

    const permissionGranted = await ensureOriginPermission(settings.baseUrl);
    if (!permissionGranted) {
      throw new Error("Host permission for this base URL was not granted.");
    }

    const result = await uploadPixelFoxFile(file, settings, (phase, message) => {
      setStatus(message || phase);
    });

    await addRecentUpload({
      shareUrl: result.shareUrl,
      imageUuid: result.image?.image_uuid || result.uploadResult?.image_uuid || "",
      title: file.name || "File upload",
      source: "file",
      duplicate: result.duplicate
    });
    await renderRecentUploads();
    await navigator.clipboard.writeText(result.shareUrl).then(() => {
      setStatus(result.duplicate ? "Uploaded. Existing link copied." : "Uploaded. Link copied.");
    }).catch(() => {
      setStatus("Uploaded. Automatic copy failed.");
    });
  } catch (error) {
    setStatus(error.message || "Upload failed.");
  } finally {
    setBusy(false);
  }
}

async function renderRecentUploads() {
  const uploads = await getRecentUploads(3);
  recentUploadsList.replaceChildren();
  emptyRecentUploads.hidden = uploads.length > 0;

  for (const upload of uploads) {
    recentUploadsList.append(createRecentUploadItem(upload));
  }
}

async function renderPremiumPromo() {
  premiumPromo.hidden = true;

  if (!settings.apiKey) {
    return;
  }

  try {
    if (!(await hasOriginPermission(settings.baseUrl))) {
      return;
    }

    const profile = await validateApiKey(settings);
    const plan = String(profile.plan || "").toLowerCase();
    premiumPromo.hidden = !plan.includes("free");
  } catch {
    premiumPromo.hidden = true;
  }
}

function createRecentUploadItem(upload) {
  const item = document.createElement("li");
  item.className = "recent-item";

  const text = document.createElement("div");
  text.className = "recent-item-text";

  const link = document.createElement("a");
  link.href = upload.shareUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = upload.title || "Upload";

  const meta = document.createElement("span");
  meta.textContent = `${formatUploadSource(upload)} | ${formatUploadTime(upload.uploadedAt)}`;

  text.append(link, meta);

  const copyButton = document.createElement("button");
  copyButton.className = "icon-button copy-upload-button";
  copyButton.type = "button";
  copyButton.dataset.url = upload.shareUrl;
  copyButton.setAttribute("aria-label", "Copy upload link");
  copyButton.title = "Copy link";

  const icon = document.createElement("span");
  icon.className = "copy-icon";
  icon.setAttribute("aria-hidden", "true");
  copyButton.append(icon);

  item.append(text, copyButton);
  return item;
}

async function copyRecentUpload(event) {
  const button = event.target.closest(".copy-upload-button");
  if (!button) {
    return;
  }

  await navigator.clipboard.writeText(button.dataset.url);
  setStatus("Link copied.");
}

function setBusy(isBusy) {
  visibleAreaButton.disabled = isBusy;
  selectionButton.disabled = isBusy;
  fileButton.disabled = isBusy;
}

function setStatus(message) {
  uploadStatus.textContent = message;
  uploadStatus.hidden = !message;
}

function formatUploadSource(upload) {
  if (upload.duplicate) {
    return "Duplicate";
  }

  if (upload.source === "screenshot") {
    return "Screenshot";
  }

  if (upload.source === "file") {
    return "File";
  }

  return "Upload";
}

function formatUploadTime(timestamp) {
  if (!timestamp) {
    return "just now";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}
