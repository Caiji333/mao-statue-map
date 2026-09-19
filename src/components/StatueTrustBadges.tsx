import type { StatueProperties } from '../types/statue';

interface Props { properties: StatueProperties; compact?: boolean; }

export function StatueTrustBadges({ properties, compact = false }: Props) {
  const highConfidence = properties.verificationStatus === 'verified' || properties.verificationStatus === 'user_verified';
  const needsPhoto = !properties.image;
  return <span className={`trust-badges${compact ? ' compact' : ''}`} aria-label="点位资料状态">
    {highConfidence ? <span className="trust-badge high">高可信</span> : <span className="trust-badge pending">待核验</span>}
    {needsPhoto && <span className="trust-badge photo">待补图片</span>}
  </span>;
}
