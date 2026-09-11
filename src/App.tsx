import { AlertTriangle, Database, Filter, Landmark, LoaderCircle, MapPinned, RefreshCw, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { FilterPanel } from './components/FilterPanel';
import { MapContainer } from './components/MapContainer';
import { SearchBar } from './components/SearchBar';
import { hasBasemap, mapProvider, mapProviderLabel } from './config/mapConfig';
import { uiText } from './config/uiText';
import { useStatues } from './hooks/useStatues';
import { filterByProvince, getProvinces } from './lib/map';
import type { FocusRequest, StatueFeature } from './types/statue';

function App() {
  const { data, loading, error, reload } = useStatues();
  const [province, setProvince] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const provinces = useMemo(() => getProvinces(data.features), [data.features]);
  const visibleFeatures = useMemo(
    () => filterByProvince(data.features, province),
    [data.features, province],
  );

  const showNotice = useCallback((message: string | null) => {
    setNotice(message);
    if (message) window.setTimeout(() => setNotice((current) => current === message ? null : current), 4200);
  }, []);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  const selectFeature = (feature: StatueFeature) => {
    if (province && feature.properties.province !== province) setProvince('');
    setFocusRequest({ feature, nonce: Date.now() });
  };

  const changeProvince = (nextProvince: string) => {
    setTransitioning(true);
    setProvince(nextProvince);
    setFocusRequest(null);
    window.setTimeout(() => setTransitioning(false), 260);
  };

  const initialLoading = loading || !mapReady;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label={uiText.appName}>
          <span className="brand-mark"><Landmark size={22} /></span>
          <span className="brand-copy">
            <strong>{uiText.appName}</strong>
            <small>{uiText.appSubtitle}</small>
          </span>
        </div>

        <SearchBar features={visibleFeatures} onSelect={selectFeature} onEmptyResult={() => showNotice(uiText.noResults)} />

        <button
          type="button"
          className={`filter-toggle ${filterOpen || province ? 'active' : ''}`}
          onClick={() => setFilterOpen((value) => !value)}
          aria-expanded={filterOpen}
        >
          <Filter size={17} />
          <span>{province || '筛选'}</span>
        </button>
      </header>

      {filterOpen && (
        <div className="filter-drawer">
          <div className="filter-drawer-inner">
            <div>
              <strong>区域筛选</strong>
              <small>按省级行政区查看收录点位</small>
            </div>
            <FilterPanel provinces={provinces} value={province} onChange={changeProvince} />
            <button type="button" className="icon-button" onClick={() => setFilterOpen(false)} aria-label="关闭筛选" title="关闭筛选">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <section className="map-stage">
        <MapContainer
          features={visibleFeatures}
          focusRequest={focusRequest}
          onReady={handleMapReady}
          onStatus={showNotice}
        />

        <div className="map-summary" aria-live="polite">
          <span className="summary-icon"><MapPinned size={18} /></span>
          <div>
            <small>{province || '全国范围'}</small>
            <strong>{visibleFeatures.length}<em>处点位</em></strong>
          </div>
          <span className="summary-separator" />
          <div className="summary-meta">
            <small>覆盖区域</small>
            <strong>{province ? 1 : provinces.length}<em>个</em></strong>
          </div>
        </div>

        <div className="map-caption">
          <Database size={13} />
          <span>{uiText.dataNotice}</span>
          <span>· {mapProviderLabel}</span>
          {mapProvider === 'amap_legacy' && <span className="token-note">· {uiText.amapLegacyNotice}</span>}
          {!hasBasemap && <span className="token-note">· {uiText.tokenMissing}</span>}
        </div>

        {transitioning && <div className="filter-transition" aria-hidden="true"><LoaderCircle size={20} /></div>}

        {!loading && !error && visibleFeatures.length === 0 && (
          <div className="empty-state">
            <MapPinned size={28} />
            <strong>{province ? '该省份暂无收录点位' : uiText.noData}</strong>
            {province && <button type="button" onClick={() => changeProvince('')}>查看全国点位</button>}
          </div>
        )}

        {error && (
          <div className="error-state">
            <AlertTriangle size={25} />
            <div><strong>{uiText.loadError}</strong><small>{error}</small></div>
            <button type="button" onClick={reload}><RefreshCw size={16} />重新加载</button>
          </div>
        )}
      </section>

      {initialLoading && (
        <div className="loading-screen" role="status">
          <div className="loading-emblem"><Landmark size={28} /></div>
          <LoaderCircle className="spin" size={23} />
          <strong>{uiText.loading}</strong>
        </div>
      )}

      {notice && <div className="toast" role="status"><AlertTriangle size={16} />{notice}</div>}
    </main>
  );
}

export default App;
