import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const API_URL = 'https://restapi.amap.com/v3/place/text';
const PAGE_SIZE = 25;
const MAX_PAGES = 4;
const REQUEST_INTERVAL_MS = 180;

const keywords = [
  '毛泽东塑像',
  '毛主席塑像',
  '毛泽东铜像',
  '毛主席铜像',
  '毛泽东雕像',
  '毛主席雕像',
  '青年毛泽东雕塑',
  '毛泽东同志塑像',
  '毛泽东主席塑像',
  '毛泽东石像',
  '毛主席像',
];

const regions = [
  '北京市', '天津市', '河北省', '山西省', '内蒙古自治区',
  '辽宁省', '吉林省', '黑龙江省', '上海市', '江苏省',
  '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '广西壮族自治区',
  '海南省', '重庆市', '四川省', '贵州省', '云南省',
  '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区',
  '新疆维吾尔自治区', '香港特别行政区', '澳门特别行政区', '台湾省',
];

const excludedNamePattern = /停车|管理所|管理处|学校|培训|酒店|宾馆|商店|超市|餐厅|饭店|公司|公交|地铁|入口|出口|售票|游客中心|卫生间|服务区|派出所|政府|村委|社区|房地产|售楼|摄影|旅行社|纪念品/;
const statueNamePattern = /(毛泽东|毛主席).*?(塑像|铜像|雕像|雕塑|石像|头像|立像|坐像)|(塑像|铜像|雕像|雕塑|石像).*?(毛泽东|毛主席)/;
const contextualNamePattern = /(毛泽东|毛主席).*?(广场|公园|纪念园|纪念地)/;

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const asText = (value) => Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : '';

const parseLocation = (location) => {
  if (typeof location !== 'string') return null;
  const coordinates = location.split(',').map(Number);
  if (coordinates.length !== 2 || coordinates.some((value) => !Number.isFinite(value))) return null;
  const [longitude, latitude] = coordinates;
  if (longitude < 73 || longitude > 136 || latitude < 3 || latitude > 54) return null;
  return [longitude, latitude];
};

const classify = (name) => {
  if (!name || excludedNamePattern.test(name)) return 'rejected';
  if (statueNamePattern.test(name)) return 'high';
  if (contextualNamePattern.test(name)) return 'review';
  return 'rejected';
};

const requestPage = async (key, region, keyword, page, retry = 0) => {
  const query = new URLSearchParams({
    key,
    keywords: keyword,
    city: region,
    citylimit: 'true',
    offset: String(PAGE_SIZE),
    page: String(page),
    extensions: 'all',
  });
  const response = await fetch(`${API_URL}?${query}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== '1') {
    if (retry < 3 && ['10003', '10016', '10019', '10020', '10021'].includes(payload.infocode)) {
      await sleep(1_500 * (retry + 1));
      return requestPage(key, region, keyword, page, retry + 1);
    }
    throw new Error(`AMap ${payload.infocode}: ${payload.info}`);
  }
  return Array.isArray(payload.pois) ? payload.pois : [];
};

const normalizePoi = (poi, keyword) => {
  const coordinates = parseLocation(poi.location);
  if (!coordinates) return null;
  const name = asText(poi.name).trim();
  return {
    amapId: asText(poi.id),
    name,
    province: asText(poi.pname),
    city: asText(poi.cityname),
    district: asText(poi.adname),
    address: asText(poi.address),
    location: coordinates,
    type: asText(poi.type),
    confidence: classify(name),
    matchedKeywords: [keyword],
  };
};

const mergePoi = (target, candidate) => {
  for (const keyword of candidate.matchedKeywords) {
    if (!target.matchedKeywords.includes(keyword)) target.matchedKeywords.push(keyword);
  }
  if (target.confidence !== 'high' && candidate.confidence === 'high') target.confidence = 'high';
};

const collect = async () => {
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!key) throw new Error('AMAP_WEB_SERVICE_KEY is required');

  const poisById = new Map();
  const failures = [];
  let requests = 0;

  for (const [regionIndex, region] of regions.entries()) {
    for (const keyword of keywords) {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        try {
          const pois = await requestPage(key, region, keyword, page);
          requests += 1;
          await sleep(REQUEST_INTERVAL_MS);
          for (const poi of pois) {
            const normalized = normalizePoi(poi, keyword);
            if (!normalized?.amapId) continue;
            const existing = poisById.get(normalized.amapId);
            if (existing) mergePoi(existing, normalized);
            else poisById.set(normalized.amapId, normalized);
          }
          if (pois.length < PAGE_SIZE) break;
        } catch (error) {
          failures.push({ region, keyword, page, error: error instanceof Error ? error.message : String(error) });
          break;
        }
      }
    }
    const highCount = [...poisById.values()].filter((poi) => poi.confidence === 'high').length;
    process.stdout.write(`[${regionIndex + 1}/${regions.length}] ${region}: ${poisById.size} unique, ${highCount} high confidence\n`);
  }

  const candidates = [...poisById.values()]
    .filter((poi) => poi.confidence !== 'rejected')
    .sort((left, right) => left.province.localeCompare(right.province, 'zh-CN') || left.city.localeCompare(right.city, 'zh-CN'));
  const report = {
    metadata: {
      source: '高德地图 Web 服务 API',
      coordinateSystem: 'GCJ-02',
      collectedAt: new Date().toISOString(),
      requests,
      regions: regions.length,
      keywords,
      uniqueRawPois: poisById.size,
      acceptedCandidates: candidates.length,
      highConfidence: candidates.filter((poi) => poi.confidence === 'high').length,
      reviewRequired: candidates.filter((poi) => poi.confidence === 'review').length,
      failures,
    },
    candidates,
  };
  const outputPath = resolve('data/amap-poi-candidates.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Saved ${candidates.length} candidates to ${outputPath}\n`);
};

await collect();
