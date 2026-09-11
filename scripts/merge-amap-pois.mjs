import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const existingPath = resolve('public/statues.geojson');
const candidatesPath = resolve('data/amap-poi-candidates.json');
const reviewPath = resolve('data/amap-poi-review.json');

const excludedIds = new Set([
  'B0FFFDJUCF', // “毛泽东选集雕塑”是书籍主题雕塑，不是人物塑像。
  'B0H0PCFOJ5', // 塑像收藏馆是场馆 POI，不能确认对应单一塑像。
]);

const normalizeName = (name) => name
  .replace(/[()（）\s·\-]/g, '')
  .replace(/毛泽东同志|毛泽东主席|毛泽东|毛主席/g, '毛')
  .replace(/铜像|塑像|雕像|雕塑|石像|主席/g, '')
  .replace(/大学.*?校区|大学/g, '')
  .replace(/公园|广场|景区|内/g, '');

const distanceMeters = ([lngA, latA], [lngB, latB]) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLatitude = radians(latB - latA);
  const deltaLongitude = radians(lngB - lngA);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const looksLikeDuplicate = (candidate, existing) => {
  if (candidate.province !== existing.properties.province) return false;
  const distance = distanceMeters(candidate.location, existing.geometry.coordinates);
  if (distance <= 80) return true;
  if (distance > 1_200) return false;
  const candidateName = normalizeName(candidate.name);
  const existingName = normalizeName(existing.properties.name);
  const namesOverlap = candidateName && existingName
    && (candidateName.includes(existingName) || existingName.includes(candidateName));
  const addressesOverlap = candidate.address && existing.properties.address
    && (candidate.address.includes(existing.properties.address) || existing.properties.address.includes(candidate.address));
  return Boolean(namesOverlap || addressesOverlap);
};

const toFeature = (candidate, collectedAt) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: candidate.location },
  properties: {
    id: `amap-${candidate.amapId.toLowerCase()}`,
    name: candidate.name,
    province: candidate.province,
    city: candidate.city || candidate.province,
    address: [candidate.district, candidate.address].filter(Boolean).join(' · ') || '暂无相关资料',
    desc: '该点位由高德地图公开 POI 检索收录，具体形制与现场状态待进一步核验。',
    background: '暂无相关资料',
    year: '暂无相关资料',
    source: '高德地图 Web 服务 API',
    sourceId: candidate.amapId,
    sourceType: candidate.type,
    verificationStatus: 'amap_unverified',
    collectedAt,
  },
});

const existing = JSON.parse(await readFile(existingPath, 'utf8'));
const report = JSON.parse(await readFile(candidatesPath, 'utf8'));
const highConfidence = report.candidates.filter((candidate) => candidate.confidence === 'high');
const accepted = [];
const duplicates = [];
const excluded = [];

for (const candidate of highConfidence) {
  if (excludedIds.has(candidate.amapId)) {
    excluded.push({ ...candidate, reason: '名称指向场馆或非人物主题雕塑' });
    continue;
  }
  const duplicate = existing.features.find((feature) => looksLikeDuplicate(candidate, feature));
  if (duplicate) {
    duplicates.push({ ...candidate, reason: `与现有点位 ${duplicate.properties.id} 疑似重复` });
    continue;
  }
  accepted.push(candidate);
}

const collectedAt = report.metadata.collectedAt.slice(0, 10);
const merged = {
  type: 'FeatureCollection',
  features: [...existing.features, ...accepted.map((candidate) => toFeature(candidate, collectedAt))],
};
const review = {
  metadata: {
    source: report.metadata.source,
    collectedAt: report.metadata.collectedAt,
    highConfidenceReviewed: highConfidence.length,
    merged: accepted.length,
    duplicates: duplicates.length,
    explicitlyExcluded: excluded.length,
    lowerConfidenceCandidates: report.candidates.filter((candidate) => candidate.confidence === 'review').length,
  },
  suspectedDuplicates: duplicates,
  excluded,
  lowerConfidenceCandidates: report.candidates.filter((candidate) => candidate.confidence === 'review'),
};

await writeFile(existingPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
process.stdout.write(`Merged ${accepted.length}; total ${merged.features.length}; duplicates ${duplicates.length}; excluded ${excluded.length}\n`);
