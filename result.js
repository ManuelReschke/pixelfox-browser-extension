import { getPendingUpload } from "./src/shared/pendingUploads.js";

const JOB_KEY = "latestJob";

const phaseText = document.getElementById("phaseText");
const statusText = document.getElementById("statusText");
const shareLink = document.getElementById("shareLink");
const previewImage = document.getElementById("previewImage");
const previewEmpty = document.getElementById("previewEmpty");
const uploadButton = document.getElementById("uploadButton");
const openButton = document.getElementById("openButton");

let copiedUrl = "";
let currentShareUrl = "";
let currentPendingUploadId = "";
let previewObjectUrl = "";

init();

async function init() {
  const stored = await chrome.storage.session.get(JOB_KEY);
  await renderJob(stored[JOB_KEY] || null);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session" && changes[JOB_KEY]) {
      renderJob(changes[JOB_KEY].newValue);
    }
  });

  uploadButton.addEventListener("click", uploadPendingScreenshot);
  openButton.addEventListener("click", openLink);
}

async function renderJob(job) {
  if (!job) {
    phaseText.textContent = "No active upload.";
    statusText.textContent = "Start a screenshot from the popup.";
    setUploadAvailable(false);
    return;
  }

  phaseText.textContent = phaseLabel(job.phase, job.state);
  statusText.textContent = job.message || "Updating status.";
  document.body.dataset.state = job.state || "running";

  if (job.pendingUploadId && job.pendingUploadId !== currentPendingUploadId) {
    currentPendingUploadId = job.pendingUploadId;
    await renderPreview(job.pendingUploadId);
  }

  if (job.shareUrl) {
    currentShareUrl = job.shareUrl;
    shareLink.href = job.shareUrl;
    shareLink.textContent = job.shareUrl;
    shareLink.hidden = false;
    openButton.disabled = false;
    uploadButton.disabled = true;
    uploadButton.textContent = "Uploaded";

    if (copiedUrl !== job.shareUrl) {
      await copyLink().catch(() => {
        statusText.textContent = "Link ready. Automatic copy failed.";
      });
    }
  } else {
    currentShareUrl = "";
    shareLink.hidden = true;
    openButton.disabled = true;
    uploadButton.textContent = "Upload & Copy Link";
    setUploadAvailable(job.state === "pending" && Boolean(job.pendingUploadId));
  }

  if (job.state === "running") {
    setUploadAvailable(false);
  }
}

async function renderPreview(pendingUploadId) {
  const pendingUpload = await getPendingUpload(pendingUploadId);

  if (!pendingUpload?.blob) {
    clearPreview();
    return;
  }

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }

  previewObjectUrl = URL.createObjectURL(pendingUpload.blob);
  previewImage.src = previewObjectUrl;
  previewImage.hidden = false;
  previewEmpty.hidden = true;
}

async function uploadPendingScreenshot() {
  if (!currentPendingUploadId) {
    return;
  }

  setUploadAvailable(false);
  statusText.textContent = "Starting upload.";

  await chrome.runtime.sendMessage({
    type: "PIXELFOX_UPLOAD_PENDING",
    pendingUploadId: currentPendingUploadId
  });
}

async function copyLink() {
  if (!currentShareUrl) {
    return;
  }

  await navigator.clipboard.writeText(currentShareUrl);
  copiedUrl = currentShareUrl;
  statusText.textContent = "Link copied.";
}

function openLink() {
  if (currentShareUrl) {
    chrome.tabs.create({ url: currentShareUrl });
  }
}

function setUploadAvailable(isAvailable) {
  uploadButton.disabled = !isAvailable;
}

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
  }

  previewImage.removeAttribute("src");
  previewImage.hidden = true;
  previewEmpty.hidden = false;
}

function phaseLabel(phase, state) {
  if (state === "pending") {
    return "Preview";
  }

  if (state === "complete") {
    return "Done";
  }

  if (state === "error") {
    return "Error";
  }

  const labels = {
    preparing: "Preparing",
    capturing: "Screenshot",
    selecting: "Selection",
    cropping: "Cropping",
    preview: "Preview",
    session: "Upload session",
    uploading: "Upload",
    processing: "Processing",
    resource: "Image data"
  };

  return labels[phase] || "Upload";
}
