import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

/**
 * Prefetch data on hover with debounce to avoid excessive prefetching.
 * Usage:
 *   const { prefetchOnHover } = usePrefetch();
 *   <tr onMouseEnter={() => prefetchOnHover(['candidat', id], `/candidats/${id}`)} ...>
 */
export function usePrefetch() {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefetchOnHover = useCallback(
    (queryKey: unknown[], url: string, delayMs = 150) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey,
          queryFn: () => api.get(url),
          staleTime: 5 * 60 * 1000,
        });
      }, delayMs);
    },
    [queryClient],
  );

  const cancelPrefetch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { prefetchOnHover, cancelPrefetch };
}
