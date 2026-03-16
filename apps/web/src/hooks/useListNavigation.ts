import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';

interface UseListNavigationOptions {
  /** Called when Enter is pressed on a focused item */
  onSelect?: (index: number) => void;
  /** Navigate to this path when Enter is pressed (item id appended) */
  basePath?: string;
  /** Enable/disable the hook */
  enabled?: boolean;
}

export function useListNavigation(
  itemCount: number,
  options: UseListNavigationOptions = {},
) {
  const { onSelect, basePath, enabled = true } = options;
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || itemCount === 0) return;

      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            if (prev < 0) return 0;
            return prev < itemCount - 1 ? prev + 1 : 0;
          });
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            if (prev < 0) return itemCount - 1;
            return prev > 0 ? prev - 1 : itemCount - 1;
          });
          break;
        }
        case 'Enter': {
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            e.preventDefault();
            onSelect?.(focusedIndex);
          }
          break;
        }
        case 'Escape': {
          setFocusedIndex(-1);
          break;
        }
      }
    },
    [enabled, itemCount, focusedIndex, onSelect],
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  // Reset focus when item count changes (e.g. filter/search)
  useEffect(() => {
    setFocusedIndex(-1);
  }, [itemCount]);

  return { focusedIndex, setFocusedIndex };
}
