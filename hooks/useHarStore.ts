'use client';

import { useState, useEffect } from 'react';
import { loadHarStoreAsync } from '@/utils/storage';
import { HarStore } from '@/types/har';

// In-memory cache for ultra-fast SPA route transitions without hitting IDB every time
let memCache: HarStore | null = null;
let isLoaded = false;

// Custom pub-sub pattern to sync data across all hooked components
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function useHarStore() {
  const [store, setStoreState] = useState<HarStore | null>(memCache);
  const [isLoading, setIsLoading] = useState(!isLoaded);

  useEffect(() => {
    if (isLoaded) {
      setIsLoading(false);
      return;
    }

    loadHarStoreAsync().then((data) => {
      memCache = data;
      isLoaded = true;
      setStoreState(data);
      setIsLoading(false);
      notify();
    });
  }, []);

  useEffect(() => {
    const trigger = () => setStoreState(memCache);
    listeners.add(trigger);
    return () => {
      listeners.delete(trigger);
    };
  }, []);

  return { store, analyses: store?.analyses ?? [], isLoading };
}

export function updateHarStoreCache(newStore: HarStore | null) {
  memCache = newStore;
  notify();
}
