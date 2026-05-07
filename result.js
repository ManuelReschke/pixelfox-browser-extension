import { getPendingUpload, updatePendingUploadBlob } from "./src/shared/pendingUploads.js";

const JOB_KEY = "latestJob";
const ANNOTATION_COLOR = "#dc2626";

const phaseText = document.getElementById("phaseText");
const statusText = document.getElementById("statusText");
const shareLink = document.getElementById("shareLink");
const previewImage = document.getElementById("previewImage");
const previewEmpty = document.getElementById("previewEmpty");
const editorCanvas = document.getElementById("editorCanvas");
const editorToolbar = document.getElementById("editorToolbar");
const editButton = document.getElementById("editButton");
const uploadButton = document.getElementById("uploadButton");
const uploadButtonLabel = uploadButton.querySelector("span");
const openButton = document.getElementById("openButton");
const undoEditButton = document.getElementById("undoEditButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const saveEditButton = document.getElementById("saveEditButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomInButton = document.getElementById("zoomInButton");
const zoomLabel = document.getElementById("zoomLabel");
const editorToolButtons = Array.from(document.querySelectorAll("[data-tool]"));
const editorContext = editorCanvas.getContext("2d");

let copiedUrl = "";
let currentShareUrl = "";
let currentPendingUploadId = "";
let previewObjectUrl = "";
let editorBaseBitmap = null;
let editorOperations = [];
let activeTool = "arrow";
let dragStart = null;
let draftOperation = null;
let activePointerId = null;
let isEditing = false;
let editorZoom = 1;

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
  editButton.addEventListener("click", enterEditMode);
  undoEditButton.addEventListener("click", undoEdit);
  cancelEditButton.addEventListener("click", cancelEdit);
  saveEditButton.addEventListener("click", saveEdit);
  zoomOutButton.addEventListener("click", () => setEditorZoom(editorZoom - 0.25));
  zoomInButton.addEventListener("click", () => setEditorZoom(editorZoom + 0.25));
  editorCanvas.addEventListener("pointerdown", onEditorPointerDown);
  editorCanvas.addEventListener("pointermove", onEditorPointerMove);
  editorCanvas.addEventListener("pointerup", onEditorPointerUp);
  editorCanvas.addEventListener("pointercancel", onEditorPointerCancel);

  for (const button of editorToolButtons) {
    button.addEventListener("click", () => setActiveTool(button.dataset.tool));
  }
}

async function renderJob(job) {
  if (!job) {
    phaseText.textContent = "No active upload.";
    statusText.textContent = "Start a screenshot from the popup.";
    setUploadAvailable(false);
    setEditAvailable(false);
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
    uploadButtonLabel.textContent = "Uploaded";
    setEditAvailable(false);

    if (copiedUrl !== job.shareUrl) {
      await copyLink().catch(() => {
        statusText.textContent = "Link ready. Automatic copy failed.";
      });
    }
  } else {
    currentShareUrl = "";
    shareLink.hidden = true;
    openButton.disabled = true;
    uploadButtonLabel.textContent = "Upload & Copy Link";
    setUploadAvailable(job.state === "pending" && Boolean(job.pendingUploadId) && !isEditing);
    setEditAvailable(job.state === "pending" && Boolean(job.pendingUploadId) && !isEditing);
  }

  if (job.state === "running") {
    setUploadAvailable(false);
    setEditAvailable(false);
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
  editorCanvas.hidden = true;
}

async function enterEditMode() {
  if (!currentPendingUploadId || isEditing) {
    return;
  }

  const pendingUpload = await getPendingUpload(currentPendingUploadId);
  if (!pendingUpload?.blob) {
    statusText.textContent = "The screenshot is no longer available. Capture it again.";
    return;
  }

  closeEditorBitmap();
  editorBaseBitmap = await createImageBitmap(pendingUpload.blob);
  editorCanvas.width = editorBaseBitmap.width;
  editorCanvas.height = editorBaseBitmap.height;
  editorOperations = [];
  draftOperation = null;
  dragStart = null;
  activePointerId = null;
  isEditing = true;
  document.body.classList.add("is-editing");
  setActiveTool("arrow");
  setEditorZoom(1);
  drawEditor();

  previewImage.hidden = true;
  previewEmpty.hidden = true;
  editorCanvas.hidden = false;
  editorToolbar.hidden = false;
  setUploadAvailable(false);
  setEditAvailable(false);
  updateUndoState();
  statusText.textContent = "Add red arrows, circles, or text, then save.";
}

function onEditorPointerDown(event) {
  if (!isEditing || activePointerId !== null) {
    return;
  }

  const point = canvasPoint(event);

  if (activeTool === "text") {
    const text = prompt("Text");
    const cleanText = String(text || "").trim();

    if (cleanText) {
      editorOperations.push({
        tool: "text",
        x: point.x,
        y: point.y,
        text: cleanText,
        size: Math.max(22, Math.round(editorCanvas.width / 34))
      });
      drawEditor();
      updateUndoState();
    }

    return;
  }

  event.preventDefault();
  activePointerId = event.pointerId;
  dragStart = point;
  draftOperation = createShapeOperation(point, point);
  editorCanvas.setPointerCapture(event.pointerId);
  drawEditor();
}

function onEditorPointerMove(event) {
  if (!isEditing || event.pointerId !== activePointerId || !dragStart) {
    return;
  }

  event.preventDefault();
  draftOperation = createShapeOperation(dragStart, canvasPoint(event));
  drawEditor();
}

function onEditorPointerUp(event) {
  if (!isEditing || event.pointerId !== activePointerId || !dragStart) {
    return;
  }

  event.preventDefault();
  const end = canvasPoint(event);
  const operation = createShapeOperation(dragStart, end);

  if (distance(dragStart, end) > 6) {
    editorOperations.push(operation);
  }

  activePointerId = null;
  dragStart = null;
  draftOperation = null;
  if (editorCanvas.hasPointerCapture(event.pointerId)) {
    editorCanvas.releasePointerCapture(event.pointerId);
  }
  drawEditor();
  updateUndoState();
}

function onEditorPointerCancel(event) {
  if (event.pointerId !== activePointerId) {
    return;
  }

  activePointerId = null;
  dragStart = null;
  draftOperation = null;
  drawEditor();
}

function undoEdit() {
  if (!editorOperations.length) {
    return;
  }

  editorOperations.pop();
  drawEditor();
  updateUndoState();
}

function cancelEdit() {
  exitEditMode();
  statusText.textContent = "Edits discarded.";
}

async function saveEdit() {
  if (!currentPendingUploadId || !isEditing) {
    return;
  }

  drawEditor();
  const blob = await canvasToBlob(editorCanvas);
  await updatePendingUploadBlob(currentPendingUploadId, blob);
  exitEditMode();
  await renderPreview(currentPendingUploadId);
  setUploadAvailable(true);
  setEditAvailable(true);
  statusText.textContent = "Edits saved.";
}

function exitEditMode() {
  isEditing = false;
  document.body.classList.remove("is-editing");
  editorToolbar.hidden = true;
  editorCanvas.hidden = true;
  previewImage.hidden = !previewImage.src;
  previewEmpty.hidden = Boolean(previewImage.src);
  draftOperation = null;
  dragStart = null;
  activePointerId = null;
  editorOperations = [];
  setEditorZoom(1);
  closeEditorBitmap();
  setUploadAvailable(Boolean(currentPendingUploadId) && !currentShareUrl);
  setEditAvailable(Boolean(currentPendingUploadId) && !currentShareUrl);
}

async function uploadPendingScreenshot() {
  if (!currentPendingUploadId || isEditing) {
    return;
  }

  setUploadAvailable(false);
  setEditAvailable(false);
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

function drawEditor() {
  if (!editorBaseBitmap) {
    return;
  }

  editorContext.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  editorContext.drawImage(editorBaseBitmap, 0, 0);

  for (const operation of editorOperations) {
    drawOperation(operation);
  }

  if (draftOperation) {
    drawOperation(draftOperation);
  }
}

function drawOperation(operation) {
  if (operation.tool === "arrow") {
    drawArrow(operation);
  } else if (operation.tool === "circle") {
    drawCircle(operation);
  } else if (operation.tool === "text") {
    drawText(operation);
  }
}

function drawArrow(operation) {
  const width = annotationLineWidth();
  const angle = Math.atan2(operation.end.y - operation.start.y, operation.end.x - operation.start.x);
  const headLength = width * 5;

  strokeWithOutline(() => {
    editorContext.beginPath();
    editorContext.moveTo(operation.start.x, operation.start.y);
    editorContext.lineTo(operation.end.x, operation.end.y);
    editorContext.moveTo(operation.end.x, operation.end.y);
    editorContext.lineTo(
      operation.end.x - headLength * Math.cos(angle - Math.PI / 6),
      operation.end.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    editorContext.moveTo(operation.end.x, operation.end.y);
    editorContext.lineTo(
      operation.end.x - headLength * Math.cos(angle + Math.PI / 6),
      operation.end.y - headLength * Math.sin(angle + Math.PI / 6)
    );
  }, width);
}

function drawCircle(operation) {
  const width = annotationLineWidth();
  const x = Math.min(operation.start.x, operation.end.x);
  const y = Math.min(operation.start.y, operation.end.y);
  const radiusX = Math.abs(operation.end.x - operation.start.x) / 2;
  const radiusY = Math.abs(operation.end.y - operation.start.y) / 2;

  strokeWithOutline(() => {
    editorContext.beginPath();
    editorContext.ellipse(x + radiusX, y + radiusY, radiusX, radiusY, 0, 0, Math.PI * 2);
  }, width);
}

function drawText(operation) {
  editorContext.save();
  editorContext.font = `800 ${operation.size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  editorContext.textBaseline = "top";
  editorContext.lineJoin = "round";
  editorContext.strokeStyle = "rgb(255 255 255 / 0.92)";
  editorContext.lineWidth = Math.max(4, Math.round(operation.size / 7));
  editorContext.strokeText(operation.text, operation.x, operation.y);
  editorContext.fillStyle = ANNOTATION_COLOR;
  editorContext.fillText(operation.text, operation.x, operation.y);
  editorContext.restore();
}

function strokeWithOutline(pathBuilder, width) {
  editorContext.save();
  editorContext.lineCap = "round";
  editorContext.lineJoin = "round";

  pathBuilder();
  editorContext.strokeStyle = "rgb(255 255 255 / 0.9)";
  editorContext.lineWidth = width + 4;
  editorContext.stroke();

  pathBuilder();
  editorContext.strokeStyle = ANNOTATION_COLOR;
  editorContext.lineWidth = width;
  editorContext.stroke();
  editorContext.restore();
}

function createShapeOperation(start, end) {
  return {
    tool: activeTool,
    start,
    end
  };
}

function setActiveTool(tool) {
  activeTool = tool;

  for (const button of editorToolButtons) {
    button.classList.toggle("is-active", button.dataset.tool === activeTool);
  }
}

function setUploadAvailable(isAvailable) {
  uploadButton.disabled = !isAvailable;
}

function setEditAvailable(isAvailable) {
  editButton.disabled = !isAvailable;
}

function updateUndoState() {
  undoEditButton.disabled = editorOperations.length === 0;
}

function setEditorZoom(nextZoom) {
  editorZoom = clamp(nextZoom, 0.75, 3);
  editorCanvas.style.width = `${editorZoom * 100}%`;
  editorCanvas.style.height = `${editorZoom * 100}%`;
  zoomLabel.textContent = `${Math.round(editorZoom * 100)}%`;
  zoomOutButton.disabled = editorZoom <= 0.75;
  zoomInButton.disabled = editorZoom >= 3;
}

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
  }

  previewImage.removeAttribute("src");
  previewImage.hidden = true;
  editorCanvas.hidden = true;
  previewEmpty.hidden = false;
  document.body.classList.remove("is-editing");
  setEditAvailable(false);
}

function closeEditorBitmap() {
  if (editorBaseBitmap) {
    editorBaseBitmap.close();
    editorBaseBitmap = null;
  }
}

function canvasPoint(event) {
  const rect = editorCanvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) * (editorCanvas.width / rect.width), 0, editorCanvas.width),
    y: clamp((event.clientY - rect.top) * (editorCanvas.height / rect.height), 0, editorCanvas.height)
  };
}

function annotationLineWidth() {
  return Math.max(5, Math.round(Math.min(editorCanvas.width, editorCanvas.height) / 140));
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not save the edited screenshot."));
      }
    }, "image/png");
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
