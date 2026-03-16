import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAutosaveOptions {
  debounceMs?: number;
}

interface UseAutosaveReturn<T> {
  restoredData: T | null;
  clearDraft: () => void;
  hasDraft: boolean;
}

export function useAutosave<T>(
  key: string,
  data: T,
  options: UseAutosaveOptions = {},
): UseAutosaveReturn<T> {
  const { debounceMs = 1000 } = options;
  const storageKey = `humanup-draft-${key}`;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // Try to restore on mount
  const [restoredData] = useState<T | null>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.data as T;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [hasDraft] = useState(() => restoredData !== null);

  // Debounced save
  useEffect(() => {
    // Skip first render to avoid overwriting restored data
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ data, timestamp: Date.now() }),
        );
      } catch {
        // localStorage full or blocked
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, storageKey, debounceMs]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { restoredData, clearDraft, hasDraft };
}
