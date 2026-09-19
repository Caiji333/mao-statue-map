import { List, MapPin, X } from 'lucide-react';
import type { StatueFeature } from '../types/statue';
import { StatueTrustBadges } from './StatueTrustBadges';

interface Props {
  features: StatueFeature[];
  onClose: () => void;
  onSelect: (feature: StatueFeature) => void;
}

export function ClusterListPanel({ features, onClose, onSelect }: Props) {
  return <aside className="cluster-panel" aria-label="聚合点位列表">
    <div className="cluster-panel-head">
      <div><span><List size={15} />当前聚合</span><strong>{features.length} 处雕像点位</strong></div>
      <button className="icon-button small" type="button" onClick={onClose} aria-label="关闭点位列表" title="关闭"><X size={18} /></button>
    </div>
    <div className="cluster-list">
      {features.map((feature) => <button type="button" key={feature.properties.id} onClick={() => onSelect(feature)}>
        <span className="cluster-list-icon"><MapPin size={16} /></span>
        <span><strong>{feature.properties.name} <StatueTrustBadges properties={feature.properties} compact /></strong><small>{[feature.properties.city, feature.properties.address].filter(Boolean).join(' · ')}</small></span>
      </button>)}
    </div>
  </aside>;
}
