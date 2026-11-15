import { useEffect, useState } from 'preact/hooks';
import { defaultData, Store } from '../lib/storage';
import type { StoreData } from '../lib/types';
import { chromeArea, onStorageChange } from './chromeArea';

/** One Store plus an in-memory copy that follows chrome.storage changes from any tab or page. */
export const store = new Store(chromeArea);

let current: StoreData = defaultData();
const listeners = new Set<(data: StoreData) => void>();
let started: Promise<StoreData> | null = null;

export function initLive(): Promise<StoreData> {
  if (started) return started;
  started = (async () => {
    current = await store.ensureInitialized();
    let timer: ReturnType<typeof setTimeout> | undefined;
    onStorageChange(() => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        current = await store.load();
        for (const l of listeners) l(current);
      }, 30);
    });
    return current;
  })();
  return started;
}

export function getData(): StoreData {
  return current;
}

export function subscribe(listener: (data: StoreData) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useData(): StoreData {
  const [data, setData] = useState(current);
  useEffect(() => {
    setData(current);
    return subscribe(setData);
  }, []);
  return data;
}
