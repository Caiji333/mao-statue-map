import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapGeoJSONFeature } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { mapConfig } from '../config/mapConfig';
import { createMapStyle, toCollection } from '../lib/map';
import type { FocusRequest, StatueFeature } from '../types/statue';
import { MarkerPopup } from './MarkerPopup';

interface MapContainerProps {
  features: StatueFeature[];
  focusRequest: FocusRequest | null;
  onReady: () => void;
  onStatus: (message: string | null) => void;
}

const SOURCE_ID = 'statues';
const CLUSTER_LAYER = 'statue-clusters';
const CLUSTER_COUNT_LAYER = 'statue-cluster-count';
const MARKER_LAYER = 'statue-markers';

export function MapContainer({ features, focusRequest, onReady, onStatus }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<{ popup: maplibregl.Popup; root: Root } | null>(null);
  const featuresRef = useRef(features);
  const [mapReady, setMapReady] = useState(false);

  featuresRef.current = features;

  const closePopup = useCallback(() => {
    const active = popupRef.current;
    if (!active) return;
    popupRef.current = null;
    active.popup.remove();
    window.setTimeout(() => active.root.unmount(), 0);
  }, []);

  const openPopup = useCallback((map: MapLibreMap, feature: StatueFeature) => {
    closePopup();
    const host = document.createElement('div');
    const root = createRoot(host);
    root.render(<MarkerPopup feature={feature} />);
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: mapConfig.popup.maxWidth,
      offset: mapConfig.popup.offset,
      className: 'statue-popup',
    })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(host)
      .addTo(map);
    popupRef.current = { popup, root };
    popup.once('close', () => {
      if (popupRef.current?.popup === popup) popupRef.current = null;
      window.setTimeout(() => root.unmount(), 0);
    });
  }, [closePopup]);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapStyle(),
      center: mapConfig.center,
      zoom: window.innerWidth < 640 ? mapConfig.mobileZoom : mapConfig.zoom,
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const timeout = window.setTimeout(() => {
      if (!disposed && !map.loaded()) onStatus('地图加载超时，请检查网络后重试');
    }, mapConfig.loadTimeoutMs);

    map.on('load', () => {
      window.clearTimeout(timeout);
      if (disposed) return;
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toCollection(featuresRef.current),
        cluster: true,
        clusterRadius: mapConfig.cluster.radius,
        clusterMaxZoom: mapConfig.cluster.maxZoom,
      });
      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            mapConfig.cluster.colors[0], mapConfig.cluster.steps[0],
            mapConfig.cluster.colors[1], mapConfig.cluster.steps[1],
            mapConfig.cluster.colors[2],
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            mapConfig.cluster.sizes[0] / 2, mapConfig.cluster.steps[0],
            mapConfig.cluster.sizes[1] / 2, mapConfig.cluster.steps[1],
            mapConfig.cluster.sizes[2] / 2,
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': 'rgba(255,250,242,.92)',
          'circle-opacity': 0.94,
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Semibold'],
          'text-size': mapConfig.cluster.countFontSize,
        },
        paint: { 'text-color': '#fffdf7' },
      });
      map.addLayer({
        id: MARKER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 9,
          'circle-color': mapConfig.marker.color,
          'circle-stroke-color': mapConfig.marker.outline,
          'circle-stroke-width': 4,
        },
      });

      map.on('click', CLUSTER_LAYER, (event) => {
        const cluster = event.features?.[0];
        const clusterId = cluster?.properties?.cluster_id as number | undefined;
        const coordinates = cluster?.geometry.type === 'Point'
          ? cluster.geometry.coordinates as [number, number]
          : undefined;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        if (clusterId === undefined || !coordinates) return;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: coordinates, zoom });
        });
      });

      map.on('click', MARKER_LAYER, (event) => {
        const clicked = event.features?.[0];
        const id = clicked?.properties?.id as string | undefined;
        const feature = featuresRef.current.find((item) => item.properties.id === id);
        if (feature) openPopup(map, feature);
      });

      const clusterTooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 20 });
      map.on('mouseenter', CLUSTER_LAYER, (event) => {
        map.getCanvas().style.cursor = 'pointer';
        const cluster = event.features?.[0] as MapGeoJSONFeature | undefined;
        if (!cluster || cluster.geometry.type !== 'Point') return;
        const count = cluster.properties?.point_count as number;
        clusterTooltip
          .setLngLat(cluster.geometry.coordinates as [number, number])
          .setText(`此处汇集 ${count} 个点位`)
          .addTo(map);
      });
      map.on('mouseleave', CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = '';
        clusterTooltip.remove();
      });
      map.on('mouseenter', MARKER_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', MARKER_LAYER, () => { map.getCanvas().style.cursor = ''; });

      setMapReady(true);
      onReady();
    });

    map.on('error', (event) => {
      if (event.error?.message) onStatus('部分地图资源加载失败，点位功能仍可继续使用');
    });

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      closePopup();
      map.remove();
      mapRef.current = null;
    };
  }, [closePopup, onReady, onStatus, openPopup]);

  useEffect(() => {
    if (!mapReady) return;
    const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(toCollection(features));
    closePopup();
  }, [closePopup, features, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !focusRequest) return;
    const { feature } = focusRequest;
    map.flyTo({ center: feature.geometry.coordinates, zoom: mapConfig.focusZoom, speed: 1.25, curve: 1.4 });
    map.once('moveend', () => openPopup(map, feature));
  }, [focusRequest, mapReady, openPopup]);

  return <div ref={containerRef} className="map-canvas" aria-label="全国教员雕像点位地图" />;
}
