import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

interface TagPickerProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  label?: string;
}

export default function TagPicker({ tags, onChange, suggestions = [], placeholder = 'Ajouter un tag...', label }: TagPickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = suggestions.filter(
    (s) => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s),
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-text-primary">{label}</label>
      )}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 min-h-[38px] focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 transition-all cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-accent border border-primary-200"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-primary-200/50 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] border-0 bg-transparent p-0 text-sm outline-none placeholder:text-text-tertiary"
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-border bg-white shadow-lg">
          {filteredSuggestions.slice(0, 10).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-primary-50 transition-colors"
            >
              <Plus size={12} className="text-text-tertiary" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
