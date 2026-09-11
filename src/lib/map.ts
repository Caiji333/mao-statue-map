import type { StyleSpecification } from 'maplibre-gl';
import { hasBasemap, hasTiandituToken, mapConfig, mapProvider } from '../config/mapConfig';
import type { StatueCollection, StatueFeature } from '../types/statue';

export const createMapStyle = (): StyleSpecification => ({
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: mapProvider === 'amap_legacy'
    ? {
        amapLegacy: {
          type: 'raster',
          tiles: [mapConfig.tileUrls.amapLegacy],
          tileSize: 256,
          attribution: '© 高德地图 · 开发预览',
        },
      }
    : hasTiandituToken ? {
        tianditu: {
          type: 'raster',
          tiles: [mapConfig.tileUrls.tiandituVector],
          tileSize: 256,
          attribution: '自然资源部 · 天地图',
        },
        tiandituLabels: {
          type: 'raster',
          tiles: [mapConfig.tileUrls.tiandituLabels],
          tileSize: 256,
        },
      }
    : {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#e8e5dc' } },
    ...(mapProvider === 'amap_legacy'
      ? [{ id: 'amap-legacy-base', type: 'raster' as const, source: 'amapLegacy' }]
      : hasBasemap ? [
          { id: 'tianditu-base', type: 'raster' as const, source: 'tianditu' },
          { id: 'tianditu-labels', type: 'raster' as const, source: 'tiandituLabels' },
        ]
      : []),
  ],
});

export const isValidStatue = (value: unknown): value is StatueFeature => {
  if (!value || typeof value !== 'object') return false;
  const feature = value as Partial<StatueFeature>;
  const coordinates = feature.geometry?.coordinates;
  return (
    feature.type === 'Feature' &&
    feature.geometry?.type === 'Point' &&
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
    coordinates[0] >= 73 &&
    coordinates[0] <= 136 &&
    coordinates[1] >= 3 &&
    coordinates[1] <= 54 &&
    typeof feature.properties?.id === 'string' &&
    typeof feature.properties.name === 'string' &&
    typeof feature.properties.province === 'string' &&
    typeof feature.properties.city === 'string' &&
    typeof feature.properties.address === 'string'
  );
};

export const sanitizeCollection = (value: unknown): StatueCollection => {
  if (!value || typeof value !== 'object') return { type: 'FeatureCollection', features: [] };
  const candidate = value as { type?: unknown; features?: unknown };
  if (candidate.type !== 'FeatureCollection' || !Array.isArray(candidate.features)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return { type: 'FeatureCollection', features: candidate.features.filter(isValidStatue) };
};

const normalize = (value: string) => value.trim().toLocaleLowerCase('zh-CN');

export const searchStatues = (features: StatueFeature[], query: string): StatueFeature[] => {
  const keyword = normalize(query);
  if (!keyword) return features;
  return features.filter(({ properties }) =>
    [properties.name, properties.city, properties.address, properties.province]
      .filter(Boolean)
      .some((field) => normalize(field).includes(keyword)),
  );
};

export const filterByProvince = (features: StatueFeature[], province: string): StatueFeature[] =>
  province ? features.filter((feature) => feature.properties.province === province) : features;

export const toCollection = (features: StatueFeature[]): StatueCollection => ({
  type: 'FeatureCollection',
  features,
});

export const getProvinces = (features: StatueFeature[]): string[] =>
  [...new Set(features.map((feature) => feature.properties.province))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
