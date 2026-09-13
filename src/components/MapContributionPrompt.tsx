import { MapPin, Plus } from 'lucide-react';

interface Props {
  coordinates: [number, number];
  onContribute: () => void;
}

export function MapContributionPrompt({ coordinates, onContribute }: Props) {
  return <div className="map-contribution-prompt">
    <div><MapPin size={15} /><span><strong>在此处新增点位</strong><small>{coordinates[0].toFixed(6)}, {coordinates[1].toFixed(6)}</small></span></div>
    <button type="button" onClick={onContribute}><Plus size={15} />我要贡献</button>
  </div>;
}
