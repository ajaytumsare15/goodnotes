/**
 * Goodnotes IndexedDB Persistence Layer
 */
class NoteStorage {
  constructor() {
    this.dbName = 'GoodnotesCloneDB';
    this.version = 1;
    this.db = null;
    this.ready = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('notebooks')) {
          db.createObjectStore('notebooks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pages')) {
          db.createObjectStore('pages', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };

      request.onerror = (e) => {
        console.error('IndexedDB init failed, fallback to memory', e);
        reject(e);
      };
    });
  }

  async getAllNotebooks() {
    await this.ready;
    return new Promise((resolve) => {
      const tx = this.db.transaction('notebooks', 'readonly');
      const store = tx.objectStore('notebooks');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async getNotebook(id) {
    await this.ready;
    return new Promise((resolve) => {
      const tx = this.db.transaction('notebooks', 'readonly');
      const store = tx.objectStore('notebooks');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async saveNotebook(notebook) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('notebooks', 'readwrite');
      const store = tx.objectStore('notebooks');
      store.put(notebook);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async deleteNotebook(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notebooks', 'pages'], 'readwrite');
      tx.objectStore('notebooks').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async getPage(pageId) {
    await this.ready;
    return new Promise((resolve) => {
      const tx = this.db.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');
      const req = store.get(pageId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async savePage(pageData) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('pages', 'readwrite');
      const store = tx.objectStore('pages');
      store.put(pageData);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async deletePage(pageId) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('pages', 'readwrite');
      tx.objectStore('pages').delete(pageId);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }
}

export const storage = new NoteStorage();
