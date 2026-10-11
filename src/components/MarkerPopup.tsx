import { CalendarDays, Copy, Image as ImageIcon, MapPin, Navigation, Pencil } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);
  const hasMoreContributors = contributors.length > 3;
  const visibleContributors = contributorsExpanded ? contributors : contributors.slice(0, 3);
  const amapNav = `https://uri.amap.com/marker?position=${longitude},${latitude}&name=${encodeURIComponent(properties.name || '雕像点位')}`;

  const copyCoords = async () => {
    const text = `${longitude.toFixed(6)}, ${latitude.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

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
        {properties.imageSource && (
          <span className="popup-image-source" title="图片由高德地图 POI 提供，仅供展示参考">图片来源：{properties.imageSource}</span>
        )}
      </div>
      <div className="popup-body">
        <div className="popup-kicker">{properties.province} · {properties.city}</div>
        <h2>{properties.name}</h2>
        <StatueTrustBadges properties={properties} />
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
            <dd className="popup-coords">
              <span>{longitude.toFixed(6)}, {latitude.toFixed(6)} · GCJ-02</span>
              <button type="button" onClick={() => void copyCoords()} title="复制坐标">
                <Copy size={12} />{copied ? '已复制' : '复制'}
              </button>
            </dd>
          </div>
          <div>
            <dt>导航</dt>
            <dd>
              <a className="popup-nav" href={amapNav} target="_blank" rel="noopener noreferrer">
                <Navigation size={13} />在高德地图打开
              </a>
            </dd>
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
