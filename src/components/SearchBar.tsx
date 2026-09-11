import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { uiText } from '../config/uiText';
import { searchStatues } from '../lib/map';
import type { StatueFeature } from '../types/statue';

interface SearchBarProps {
  features: StatueFeature[];
  onSelect: (feature: StatueFeature) => void;
  onEmptyResult: (query: string) => void;
}

export function SearchBar({ features, onSelect, onEmptyResult }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => searchStatues(features, query).slice(0, 6), [features, query]);
  const showSuggestions = focused && query.trim().length > 0;

  const submit = () => {
    const keyword = query.trim();
    if (!keyword) return;
    const [first] = searchStatues(features, keyword);
    if (first) {
      onSelect(first);
      setQuery(first.properties.name);
      setFocused(false);
    } else {
      onEmptyResult(keyword);
    }
  };

  return (
    <div className="search-wrap">
      <div className="search-shell">
        <Search aria-hidden="true" size={18} className="search-icon" />
        <input
          aria-label={uiText.searchPlaceholder}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') setFocused(false);
          }}
          placeholder={uiText.searchPlaceholder}
        />
        {query && (
          <button
            type="button"
            className="icon-button small"
            aria-label="清空搜索"
            title="清空搜索"
            onClick={() => setQuery('')}
          >
            <X size={15} />
          </button>
        )}
        <button type="button" className="search-submit" onClick={submit} aria-label="搜索" title="搜索">
          <Search size={17} />
        </button>
      </div>

      {showSuggestions && (
        <div className="suggestions" role="listbox" aria-label="搜索建议">
          {matches.length > 0 ? (
            matches.map((feature) => (
              <button
                key={feature.properties.id}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(feature);
                  setQuery(feature.properties.name);
                  setFocused(false);
                }}
              >
                <span>{feature.properties.name}</span>
                <small>{feature.properties.city} · {feature.properties.address}</small>
              </button>
            ))
          ) : (
            <div className="suggestion-empty">{uiText.noResults}</div>
          )}
        </div>
      )}
    </div>
  );
}
