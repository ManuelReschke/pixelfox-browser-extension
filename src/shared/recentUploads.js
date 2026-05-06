const RECENT_UPLOADS_KEY = "recentUploads";
const MAX_RECENT_UPLOADS = 10;

export async function getRecentUploads(limit = 3) {
  const stored = await chrome.storage.local.get(RECENT_UPLOADS_KEY);
  const uploads = Array.isArray(stored[RECENT_UPLOADS_KEY])
    ? stored[RECENT_UPLOADS_KEY]
    : [];

  return uploads
    .filter((upload) => upload?.shareUrl)
    .sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0))
    .slice(0, limit);
}

export async function addRecentUpload(upload) {
  if (!upload?.shareUrl) {
    return getRecentUploads();
  }

  const existing = await getRecentUploads(MAX_RECENT_UPLOADS);
  const entry = {
    id: crypto.randomUUID(),
    shareUrl: upload.shareUrl,
    imageUuid: upload.imageUuid || "",
    title: upload.title || "Upload",
    source: upload.source || "upload",
    duplicate: Boolean(upload.duplicate),
    uploadedAt: Date.now()
  };

  const next = [
    entry,
    ...existing.filter((item) => item.shareUrl !== entry.shareUrl)
  ].slice(0, MAX_RECENT_UPLOADS);

  await chrome.storage.local.set({ [RECENT_UPLOADS_KEY]: next });
  return next.slice(0, 3);
}
