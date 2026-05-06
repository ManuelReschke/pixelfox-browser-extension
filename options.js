import {
  clearApiKey,
  ensureOriginPermission,
  loadSettings,
  maskApiKey,
  saveSettings,
  sanitizeAlbumId
} from "./src/shared/config.js";
import { validateApiKey } from "./src/shared/pixelfoxApi.js";

const form = document.getElementById("settingsForm");
const apiKeyInput = document.getElementById("apiKeyInput");
const baseUrlInput = document.getElementById("baseUrlInput");
const nsfwInput = document.getElementById("nsfwInput");
const processingInput = document.getElementById("processingInput");
const albumIdInput = document.getElementById("albumIdInput");
const savedKeyState = document.getElementById("savedKeyState");
const deleteKeyButton = document.getElementById("deleteKeyButton");
const validateButton = document.getElementById("validateButton");
const statusText = document.getElementById("statusText");

let settings = null;

init();

async function init() {
  settings = await loadSettings();
  render();

  form.addEventListener("submit", saveForm);
  validateButton.addEventListener("click", validateCurrentSettings);
  deleteKeyButton.addEventListener("click", deleteApiKey);
}

function render() {
  baseUrlInput.value = settings.baseUrl;
  nsfwInput.checked = Boolean(settings.isNsfw);
  processingInput.value = settings.processingProfile;
  albumIdInput.value = settings.albumId || "";
  apiKeyInput.value = "";

  if (settings.apiKey) {
    savedKeyState.textContent = `Saved: ${maskApiKey(settings.apiKey)}`;
    deleteKeyButton.hidden = false;
  } else {
    savedKeyState.textContent = "No API key saved.";
    deleteKeyButton.hidden = true;
  }
}

async function saveForm(event) {
  event.preventDefault();

  try {
    setBusy(true);
    const next = formSettings();
    const permissionGranted = await ensureOriginPermission(next.baseUrl);

    if (!permissionGranted) {
      throw new Error("Host permission for this base URL was not granted.");
    }

    settings = await saveSettings(next);
    render();
    setStatus("Settings saved.");
  } catch (error) {
    setStatus(error.message || "Settings could not be saved.");
  } finally {
    setBusy(false);
  }
}

async function validateCurrentSettings() {
  try {
    setBusy(true);
    const candidate = {
      ...settings,
      ...formSettings()
    };

    if (!candidate.apiKey) {
      throw new Error("Enter or save an API key first.");
    }

    const permissionGranted = await ensureOriginPermission(candidate.baseUrl);
    if (!permissionGranted) {
      throw new Error("Host permission for this base URL was not granted.");
    }

    const profile = await validateApiKey(candidate);
    const maxUpload = formatBytes(profile.limits?.max_upload_bytes);
    const uploadState = profile.limits?.image_upload_enabled && profile.limits?.direct_upload_enabled
      ? "Uploads enabled"
      : "Uploads restricted";

    setStatus(`API key valid for ${profile.username || profile.email || "PixelFox"}. ${uploadState}. Limit: ${maxUpload}.`);
  } catch (error) {
    setStatus(error.message || "API key could not be checked.");
  } finally {
    setBusy(false);
  }
}

async function deleteApiKey() {
  try {
    settings = await clearApiKey();
    render();
    setStatus("API key deleted.");
  } catch (error) {
    setStatus(error.message || "API key could not be deleted.");
  }
}

function formSettings() {
  const patch = {
    baseUrl: baseUrlInput.value,
    isNsfw: nsfwInput.checked,
    processingProfile: processingInput.value,
    albumId: sanitizeAlbumId(albumIdInput.value)
  };

  const key = apiKeyInput.value.trim();
  if (key) {
    patch.apiKey = key;
  }

  return patch;
}

function setBusy(isBusy) {
  for (const element of [apiKeyInput, baseUrlInput, nsfwInput, processingInput, albumIdInput, deleteKeyButton, validateButton]) {
    element.disabled = isBusy;
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "unknown";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
