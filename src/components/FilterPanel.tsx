import { RotateCcw } from 'lucide-react';
import { uiText } from '../config/uiText';

interface FilterPanelProps {
  provinces: string[];
  value: string;
  onChange: (province: string) => void;
}

export function FilterPanel({ provinces, value, onChange }: FilterPanelProps) {
  return (
    <div className="filter-panel">
      <label htmlFor="province-select">省份</label>
      <select
        id="province-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="按省份筛选"
      >
        <option value="">{uiText.allProvinces}</option>
        {provinces.map((province) => (
          <option value={province} key={province}>{province}</option>
        ))}
      </select>
      {value && (
        <button type="button" className="icon-button" onClick={() => onChange('')} aria-label="重置筛选" title="重置筛选">
          <RotateCcw size={17} />
        </button>
      )}
    </div>
  );
}
