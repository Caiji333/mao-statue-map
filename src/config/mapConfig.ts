const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN?.trim() ?? '';
const amapKey = import.meta.env.VITE_AMAP_KEY?.trim() ?? '';
const configuredProvider = import.meta.env.VITE_MAP_PROVIDER?.trim();

export type MapProvider = 'amap_legacy' | 'tianditu';

// 默认始终优先高德（个人版日活三四十足够）；显式配置 tianditu 时才用天地图。
export const mapProvider: MapProvider = configuredProvider === 'tianditu'
  ? 'tianditu'
  : configuredProvider === 'amap_legacy'
    ? 'amap_legacy'
    : 'amap_legacy';

export const mapConfig = {
  provider: mapProvider,
  token: tiandituToken,
  amapKey,
  coordinateSystem: 'GCJ-02',
  center: [104.2, 35.8] as [number, number],
  zoom: 3.15,
  mobileZoom: 2.55,
  minZoom: 2.2,
  maxZoom: 18,
  focusZoom: 13,
  loadTimeoutMs: 12_000,
  maxLoadAttempts: 2,
  tileUrls: {
    // 高德栅格瓦片（GCJ-02，与点位坐标一致）
    amapLegacy: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    tiandituVector: `https://t{0-7}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tiandituToken}`,
    tiandituLabels: `https://t{0-7}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tiandituToken}`,
  },
  cluster: {
    radius: 54,
    maxZoom: 13,
    sizes: [30, 38, 46] as [number, number, number],
    steps: [10, 30] as [number, number],
    colors: ['#2f675c', '#b6862d', '#9f3036'] as [string, string, string],
    countFontSize: 13,
  },
  marker: {
    size: 36,
    color: '#a52e34',
    outline: '#fffaf2',
  },
  popup: {
    maxWidth: '360px',
    offset: 24,
  },
} as const;

export const hasTiandituToken = mapConfig.token.length > 0;
export const hasAmapKey = mapConfig.amapKey.length > 0;
// 高德瓦片直连不强制要 Key；配了 Key 用于控制台统计/后续 Web 服务
export const hasBasemap = mapProvider === 'amap_legacy' || hasTiandituToken;
export const mapProviderLabel = mapProvider === 'amap_legacy'
  ? (hasAmapKey ? '高德地图' : '高德预览底图')
  : '天地图';
