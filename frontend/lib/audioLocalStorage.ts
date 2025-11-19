/**
 * IndexedDB utility for audio files
 * Uses IndexedDB instead of localStorage for larger storage capacity (50MB-500MB+)
 * Stores Blobs directly without base64 encoding for better performance
 */

const DB_NAME = "lavoe_audio_db";
const STORE_NAME = "audio_files";
const DB_VERSION = 1;

export interface StoredAudio {
  id: string;
  blob: Blob;
  url: string;
  metadata: {
    type: "main" | "bass" | "chords" | "melody" | "percussion";
    prompt?: string;
    createdAt: string;
  };
}

interface AudioRecord {
  id: string;
  blob: Blob;
  metadata: StoredAudio["metadata"];
}

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Store audio in IndexedDB
 */
export async function storeAudio(
  id: string,
  blob: Blob,
  metadata: StoredAudio["metadata"]
): Promise<void> {
  try {
    const db = await openDB();

    const record: AudioRecord = {
      id,
      blob,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
      },
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);

      request.onsuccess = () => {
        console.log(`✅ Stored audio ${id} in IndexedDB (${blob.size} bytes)`);
        resolve();
      };
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Failed to store audio in IndexedDB:", error);
    throw new Error("Failed to store audio in IndexedDB");
  }
}

/**
 * Retrieve audio from IndexedDB
 */
export async function getAudio(id: string): Promise<StoredAudio | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const record = request.result as AudioRecord | undefined;

        if (!record) {
          resolve(null);
        } else {
          const url = URL.createObjectURL(record.blob);
          resolve({
            id: record.id,
            blob: record.blob,
            url,
            metadata: record.metadata,
          });
        }
      };

      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Failed to retrieve audio from IndexedDB:", error);
    return null;
  }
}

/**
 * Delete audio from IndexedDB
 */
export async function deleteAudio(id: string): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Failed to delete audio from IndexedDB:", error);
  }
}

/**
 * List all stored audio IDs
 */
export async function listAudioIds(): Promise<string[]> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Failed to list audio IDs from IndexedDB:", error);
    return [];
  }
}

/**
 * Clear all audio from IndexedDB
 */
export async function clearAllAudio(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("🗑️  Cleared all audio from IndexedDB");
        resolve();
      };
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Failed to clear audio from IndexedDB:", error);
  }
}

/**
 * Get total storage size used by audio (estimate)
 */
export async function getStorageSize(): Promise<number> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result as AudioRecord[];
        const totalSize = records.reduce((sum, record) => sum + record.blob.size, 0);
        resolve(totalSize);
      };
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Failed to get storage size from IndexedDB:", error);
    return 0;
  }
}
