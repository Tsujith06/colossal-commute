// Offline storage utilities using IndexedDB
const DB_NAME = 'FileShareOfflineDB';
const DB_VERSION = 1;
const OFFLINE_FILES_STORE = 'offlineFiles';
const UPLOAD_QUEUE_STORE = 'uploadQueue';

export interface OfflineFile {
  id: string;
  filename: string;
  file: Blob;
  downloadedAt: Date;
  shareToken?: string;
  size: number;
}

export interface QueuedUpload {
  id: string;
  filename: string;
  file: Blob;
  queuedAt: Date;
  size: number;
}

class OfflineStorageManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store for downloaded files (for offline access)
        if (!db.objectStoreNames.contains(OFFLINE_FILES_STORE)) {
          const offlineStore = db.createObjectStore(OFFLINE_FILES_STORE, { keyPath: 'id' });
          offlineStore.createIndex('filename', 'filename', { unique: false });
        }
        
        // Store for queued uploads (when offline)
        if (!db.objectStoreNames.contains(UPLOAD_QUEUE_STORE)) {
          const queueStore = db.createObjectStore(UPLOAD_QUEUE_STORE, { keyPath: 'id' });
          queueStore.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
    });
  }

  // Offline file caching for downloads
  async saveOfflineFile(file: OfflineFile): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([OFFLINE_FILES_STORE], 'readwrite');
    const store = transaction.objectStore(OFFLINE_FILES_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.put(file);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineFile(id: string): Promise<OfflineFile | null> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([OFFLINE_FILES_STORE], 'readonly');
    const store = transaction.objectStore(OFFLINE_FILES_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllOfflineFiles(): Promise<OfflineFile[]> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([OFFLINE_FILES_STORE], 'readonly');
    const store = transaction.objectStore(OFFLINE_FILES_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteOfflineFile(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([OFFLINE_FILES_STORE], 'readwrite');
    const store = transaction.objectStore(OFFLINE_FILES_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Upload queue management
  async queueUpload(upload: QueuedUpload): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([UPLOAD_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(UPLOAD_QUEUE_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.put(upload);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUploadQueue(): Promise<QueuedUpload[]> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([UPLOAD_QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(UPLOAD_QUEUE_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeFromUploadQueue(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([UPLOAD_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(UPLOAD_QUEUE_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearUploadQueue(): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction([UPLOAD_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(UPLOAD_QUEUE_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineStorage = new OfflineStorageManager();