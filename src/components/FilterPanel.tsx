import { RotateCcw } from 'lucide-react';
import { uiText } from '../config/uiText';

export interface StatuteFilters {
  province: string;
  hasImage: boolean;
  highTrust: boolean;
}

interface FilterPanelProps {
  provinces: string[];
  value: StatuteFilters;
  onChange: (next: StatuteFilters) => void;
}

export function FilterPanel({ provinces, value, onChange }: FilterPanelProps) {
  const setProvince = (province: string) => onChange({ ...value, province });
  const reset = () => onChange({ province: '', hasImage: false, highTrust: false });
  const dirty = value.province || value.hasImage || value.highTrust;

  return (
    <div className="filter-panel">
      <label htmlFor="province-select">省份</label>
      <select
        id="province-select"
        value={value.province}
        onChange={(event) => setProvince(event.target.value)}
        aria-label="按省份筛选"
      >
        <option value="">{uiText.allProvinces}</option>
        {provinces.map((province) => (
          <option value={province} key={province}>{province}</option>
        ))}
      </select>
      <label className="filter-check">
        <input
          type="checkbox"
          checked={value.hasImage}
          onChange={(event) => onChange({ ...value, hasImage: event.target.checked })}
        />
        <span>有图片</span>
      </label>
      <label className="filter-check">
        <input
          type="checkbox"
          checked={value.highTrust}
          onChange={(event) => onChange({ ...value, highTrust: event.target.checked })}
        />
        <span>高可信</span>
      </label>
      {dirty && (
        <button type="button" className="icon-button" onClick={reset} aria-label="重置筛选" title="重置筛选">
          <RotateCcw size={17} />
        </button>
      )}
    </div>
  );
}
