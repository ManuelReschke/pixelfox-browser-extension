const DB_NAME = "pixelfox-extension";
const DB_VERSION = 1;
const STORE_NAME = "pendingUploads";

export async function savePendingUpload(upload) {
  const record = {
    id: crypto.randomUUID(),
    blob: upload.blob,
    filename: upload.filename || "pixelfox-upload.png",
    source: upload.source || "screenshot",
    mimeType: upload.blob?.type || "image/png",
    size: upload.blob?.size || 0,
    createdAt: Date.now()
  };

  await writeRecord(record);
  return record;
}

export async function getPendingUpload(id) {
  if (!id) {
    return null;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePendingUpload(id) {
  if (!id) {
    return;
  }

  const db = await openDatabase();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function writeRecord(record) {
  const db = await openDatabase();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
