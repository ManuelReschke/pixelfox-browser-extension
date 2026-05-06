const STORAGE_KEYS = [
  "apiKey",
  "baseUrl",
  "isNsfw",
  "processingProfile",
  "albumId"
];

export const DEFAULT_SETTINGS = Object.freeze({
  apiKey: "",
  baseUrl: "https://pixelfox.cc",
  isNsfw: false,
  processingProfile: "original_only",
  albumId: null
});

export const ALLOWED_BASE_URLS = Object.freeze([
  "https://pixelfox.cc",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]);

export function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  const parsed = new URL(raw || DEFAULT_SETTINGS.baseUrl);
  const normalized = parsed.origin;

  if (!ALLOWED_BASE_URLS.includes(normalized)) {
    throw new Error("This extension only supports pixelfox.cc and local PixelFox development on port 8080.");
  }

  return normalized;
}

export function getOriginPattern(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/*`;
}

export function sanitizeAlbumId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("The album ID must be a positive whole number.");
  }

  return parsed;
}

export function sanitizeProcessingProfile(value) {
  if (value === "default" || value === "original_only") {
    return value;
  }

  return DEFAULT_SETTINGS.processingProfile;
}

export function maskApiKey(apiKey) {
  if (!apiKey) {
    return "";
  }

  if (apiKey.length <= 12) {
    return "saved";
  }

  return `${apiKey.slice(0, 7)}...${apiKey.slice(-6)}`;
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS);

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    baseUrl: normalizeBaseUrl(stored.baseUrl || DEFAULT_SETTINGS.baseUrl),
    isNsfw: Boolean(stored.isNsfw),
    processingProfile: sanitizeProcessingProfile(stored.processingProfile),
    albumId: sanitizeAlbumId(stored.albumId)
  };
}

export async function saveSettings(patch) {
  const next = {};

  if (Object.hasOwn(patch, "apiKey")) {
    next.apiKey = String(patch.apiKey || "").trim();
  }

  if (Object.hasOwn(patch, "baseUrl")) {
    next.baseUrl = normalizeBaseUrl(patch.baseUrl);
  }

  if (Object.hasOwn(patch, "isNsfw")) {
    next.isNsfw = Boolean(patch.isNsfw);
  }

  if (Object.hasOwn(patch, "processingProfile")) {
    next.processingProfile = sanitizeProcessingProfile(patch.processingProfile);
  }

  if (Object.hasOwn(patch, "albumId")) {
    next.albumId = sanitizeAlbumId(patch.albumId);
  }

  await chrome.storage.local.set(next);
  return loadSettings();
}

export async function clearApiKey() {
  await chrome.storage.local.remove("apiKey");
  return loadSettings();
}

export async function ensureOriginPermission(baseUrl) {
  const pattern = getOriginPattern(baseUrl);

  if (pattern === "https://pixelfox.cc/*") {
    return true;
  }

  const hasPermission = await chrome.permissions.contains({ origins: [pattern] });
  if (hasPermission) {
    return true;
  }

  return chrome.permissions.request({ origins: [pattern] });
}

export async function hasOriginPermission(baseUrl) {
  const pattern = getOriginPattern(baseUrl);

  if (pattern === "https://pixelfox.cc/*") {
    return true;
  }

  return chrome.permissions.contains({ origins: [pattern] });
}

export function assertReadyForUpload(settings) {
  if (!settings.apiKey) {
    throw new Error("Please save a PixelFox API key in settings first.");
  }

  normalizeBaseUrl(settings.baseUrl);
}
