import { assertReadyForUpload } from "./config.js";

const STATUS_POLL_INTERVAL_MS = 1000;
const STATUS_POLL_ATTEMPTS = 45;

export class PixelFoxApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = "PixelFoxApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function validateApiKey(settings) {
  assertReadyForUpload(settings);
  return apiJson(settings, "/user/profile");
}

export async function uploadPixelFoxFile(file, settings, onStatus = () => {}) {
  assertReadyForUpload(settings);

  onStatus("session", "Creating upload session.");
  const session = await createUploadSession(file.size, settings);

  onStatus("uploading", "Uploading file.");
  const uploadResult = await uploadToSession(file, session, settings.baseUrl);

  const imageUuid = uploadResult.image_uuid;
  if (!imageUuid) {
    throw new PixelFoxApiError("The upload response did not contain an image ID.");
  }

  onStatus("processing", "Processing image.");
  await waitForProcessing(imageUuid, settings, onStatus);

  onStatus("resource", "Loading image data.");
  const image = await apiJson(settings, `/images/${encodeURIComponent(imageUuid)}`);
  const shareUrl = resolveShareUrl(settings.baseUrl, image, uploadResult);

  return {
    shareUrl,
    image,
    uploadResult,
    duplicate: Boolean(uploadResult.duplicate)
  };
}

async function createUploadSession(fileSize, settings) {
  const body = {
    file_size: fileSize,
    is_nsfw: Boolean(settings.isNsfw),
    processing: {
      profile: settings.processingProfile || "original_only"
    }
  };

  if (settings.albumId) {
    body.album_id = settings.albumId;
  }

  return apiJson(settings, "/upload/sessions", {
    method: "POST",
    body
  });
}

async function uploadToSession(file, session, baseUrl) {
  if (!session.upload_url || !session.token) {
    throw new PixelFoxApiError("The upload session is incomplete.");
  }

  const formData = new FormData();
  formData.append("file", file, file.name || "pixelfox-upload.png");

  const uploadUrl = new URL(session.upload_url, baseUrl).toString();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`
    },
    body: formData
  });

  return readJsonResponse(response, "Upload failed.");
}

async function waitForProcessing(imageUuid, settings, onStatus) {
  for (let attempt = 1; attempt <= STATUS_POLL_ATTEMPTS; attempt += 1) {
    const status = await apiJson(settings, `/images/${encodeURIComponent(imageUuid)}/status`);

    if (status.failed) {
      throw new PixelFoxApiError("Image processing failed.");
    }

    if (status.complete) {
      return;
    }

    onStatus("processing", `Processing image (${attempt}/${STATUS_POLL_ATTEMPTS}).`);
    await sleep(STATUS_POLL_INTERVAL_MS);
  }

  throw new PixelFoxApiError("Image processing is taking too long. Please check again later.");
}

async function apiJson(settings, path, options = {}) {
  const headers = {
    Accept: "application/json",
    "X-API-Key": settings.apiKey
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(apiUrl(settings.baseUrl, path), {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  return readJsonResponse(response, "API-Request fehlgeschlagen.");
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new PixelFoxApiError(apiErrorMessage(response.status, payload, fallbackMessage), {
      status: response.status,
      payload
    });
  }

  return payload || {};
}

function apiUrl(baseUrl, path) {
  return new URL(`/api/v1${path}`, baseUrl).toString();
}

function resolveShareUrl(baseUrl, image, uploadResult) {
  const candidate = image.view_url || uploadResult.view_url || image.url || uploadResult.url;

  if (!candidate) {
    throw new PixelFoxApiError("PixelFox did not return a share link.");
  }

  return new URL(candidate, baseUrl).toString();
}

function apiErrorMessage(status, payload, fallbackMessage) {
  const message = payload?.message || payload?.error || fallbackMessage;

  if (status === 401) {
    return "The API key is missing or invalid.";
  }

  if (status === 403) {
    return "This account is not allowed to upload right now.";
  }

  if (status === 413) {
    return "The file is too large for your current limit.";
  }

  if (status === 415) {
    return "PixelFox does not accept this file type.";
  }

  if (status === 429) {
    return "The upload rate limit was reached. Please wait a moment.";
  }

  if (status === 503) {
    return "PixelFox is not accepting uploads right now.";
  }

  return message;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
