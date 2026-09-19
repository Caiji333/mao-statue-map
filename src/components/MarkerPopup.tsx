import { CalendarDays, Image as ImageIcon, MapPin, Pencil } from 'lucide-react';
import { useState } from 'react';
import { uiText } from '../config/uiText';
import type { StatueFeature } from '../types/statue';
import { ImagePreview } from './ImagePreview';
import { StatueTrustBadges } from './StatueTrustBadges';

interface MarkerPopupProps {
  feature: StatueFeature;
  onSuggestEdit?: (feature: StatueFeature) => void;
}

export function MarkerPopup({ feature, onSuggestEdit }: MarkerPopupProps) {
  const { properties, geometry } = feature;
  const [longitude, latitude] = geometry.coordinates;
  const fallback = uiText.unknown;
  const contributors = properties.contributors ?? [];
  const [contributorsExpanded, setContributorsExpanded] = useState(false);
  const hasMoreContributors = contributors.length > 3;
  const visibleContributors = contributorsExpanded ? contributors : contributors.slice(0, 3);

  return (
    <article className="popup-card">
      <div className="popup-media">
        {properties.image ? (
          <ImagePreview src={properties.image} alt={properties.name} />
        ) : (
          <div className="popup-media-placeholder">
            <ImageIcon size={22} aria-hidden="true" />
            <span>影像资料待补充</span>
          </div>
        )}
        <span className="popup-year"><CalendarDays size={13} />{properties.year || fallback}</span>
      </div>
      <div className="popup-body">
        <div className="popup-kicker">{properties.province} · {properties.city}</div>
        <h2>{properties.name}</h2>
        <StatueTrustBadges properties={properties} />
        {properties.verificationStatus === 'amap_unverified' && (
          <span className="popup-verification">高德地图收录 · 待人工核验</span>
        )}
        {properties.verificationStatus === 'user_verified' && (
          <span className="popup-verification verified">用户现场确认</span>
        )}
        <p className="popup-address"><MapPin size={15} />{properties.address || fallback}</p>
        <dl>
          <div>
            <dt>简介</dt>
            <dd>{properties.desc || fallback}</dd>
          </div>
          <div>
            <dt>背景</dt>
            <dd>{properties.background || fallback}</dd>
          </div>
          <div>
            <dt>坐标</dt>
            <dd>{longitude.toFixed(6)}, {latitude.toFixed(6)} · GCJ-02</dd>
          </div>
          <div>
            <dt>贡献人</dt>
            <dd className="popup-contributors"><span>{contributors.length ? `${visibleContributors.join('、')}${hasMoreContributors && !contributorsExpanded ? '…' : ''}` : '暂无用户贡献'}</span>{hasMoreContributors && <button type="button" onClick={() => setContributorsExpanded((value) => !value)}>{contributorsExpanded ? '收起' : '展开全部'}</button>}</dd>
          </div>
        </dl>
        {onSuggestEdit && <button className="popup-edit" type="button" onClick={() => onSuggestEdit(feature)}><Pencil size={14} />提交资料修改建议</button>}
      </div>
    </article>
  );
}
