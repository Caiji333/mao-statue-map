const tiandituToken = import.meta.env.VITE_TIANDITU_TOKEN?.trim() ?? '';
const configuredProvider = import.meta.env.VITE_MAP_PROVIDER?.trim();

export type MapProvider = 'amap_legacy' | 'tianditu';

export const mapProvider: MapProvider = configuredProvider === 'amap_legacy' || configuredProvider === 'tianditu'
  ? configuredProvider
  : import.meta.env.DEV ? 'amap_legacy' : 'tianditu';

export const mapConfig = {
  provider: mapProvider,
  token: tiandituToken,
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
export const hasBasemap = mapProvider === 'amap_legacy' || hasTiandituToken;
export const mapProviderLabel = mapProvider === 'amap_legacy' ? '高德预览底图' : '天地图';
