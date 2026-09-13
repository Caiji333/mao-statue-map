import { AlertTriangle, Database, Filter, Landmark, LoaderCircle, LogIn, MapPinned, Plus, RefreshCw, ShieldCheck, User, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { FilterPanel } from './components/FilterPanel';
import { MapContainer } from './components/MapContainer';
import { SearchBar } from './components/SearchBar';
import { AuthDialog } from './components/AuthDialog';
import { ContributionDialog, type ContributionInput } from './components/ContributionDialog';
import { AdminPanel } from './components/AdminPanel';
import { MyContributionsPanel } from './components/MyContributionsPanel';
import { ClusterListPanel } from './components/ClusterListPanel';
import { hasBasemap, mapProvider, mapProviderLabel } from './config/mapConfig';
import { uiText } from './config/uiText';
import { useStatues } from './hooks/useStatues';
import { filterByProvince, getProvinces } from './lib/map';
import type { FocusRequest, StatueFeature } from './types/statue';
import { useAuth } from './hooks/useAuth';
import { submitContribution } from './lib/contributions';

function App() {
  const { data, loading, error, reload } = useStatues();
  const auth = useAuth();
  const [province, setProvince] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [contributionOpen, setContributionOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<StatueFeature | undefined>();
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [clusterFeatures, setClusterFeatures] = useState<StatueFeature[]>([]);
  const [contributionCoordinates, setContributionCoordinates] = useState<[number, number] | undefined>();
  const [pendingPickedCoordinates, setPendingPickedCoordinates] = useState<[number, number] | undefined>();

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
    setClusterFeatures([]);
    setFocusRequest(null);
    window.setTimeout(() => setTransitioning(false), 260);
  };

  const openContribution = useCallback((feature?: StatueFeature, coordinates?: [number, number]) => {
    if (!auth.user) { setAuthOpen(true); return; }
    setEditingFeature(feature); setContributionCoordinates(coordinates); setContributionOpen(true);
  }, [auth.user]);

  const pickCoordinates = useCallback((coordinates: [number, number]) => {
    if (!auth.user) { setPendingPickedCoordinates(coordinates); setAuthOpen(true); return; }
    openContribution(undefined, coordinates);
  }, [auth.user, openContribution]);

  const handleContribution = async (input: ContributionInput) => {
    if (!auth.user) return '请先登录';
    const result = await submitContribution(input, auth.user.id);
    if (!result) showNotice('提交成功，管理员审核通过后将立即公开');
    return result;
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

        <div className="top-actions">
          {auth.user && <button type="button" className="action-button contribute-button" onClick={() => openContribution()}><Plus size={17} /><span>贡献点位</span></button>}
          {auth.isAdmin && <button type="button" className="action-button" onClick={() => setAdminOpen(true)}><ShieldCheck size={17} /><span>审核</span></button>}
          <button type="button" className="action-button account-button" onClick={() => auth.user ? setAccountOpen(true) : setAuthOpen(true)} title={auth.user ? auth.user.email : '登录'}>
            {auth.user ? <User size={17} /> : <LogIn size={17} />}<span>{auth.user ? '我的' : '登录'}</span>
          </button>
          <button type="button" className={`filter-toggle ${filterOpen || province ? 'active' : ''}`} onClick={() => setFilterOpen((value) => !value)} aria-expanded={filterOpen}><Filter size={17} /><span>{province || '筛选'}</span></button>
        </div>
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
          onSuggestEdit={(feature) => openContribution(feature)}
          onClusterSelect={setClusterFeatures}
          onPickCoordinates={pickCoordinates}
        />

        {clusterFeatures.length > 0 && <ClusterListPanel features={clusterFeatures} onClose={() => setClusterFeatures([])} onSelect={selectFeature} />}

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
      {authOpen && <AuthDialog onClose={() => { setAuthOpen(false); setPendingPickedCoordinates(undefined); }} onAuthenticated={() => { setAuthOpen(false); if (pendingPickedCoordinates) { setContributionCoordinates(pendingPickedCoordinates); setPendingPickedCoordinates(undefined); setContributionOpen(true); } }} onSignIn={auth.signIn} onSignUp={auth.signUp} />}
      {contributionOpen && <ContributionDialog nearby={data.features} existingFeature={editingFeature} initialCoordinates={contributionCoordinates} onSubmit={handleContribution} onClose={() => { setContributionOpen(false); setEditingFeature(undefined); setContributionCoordinates(undefined); }} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} onChanged={reload} onLocate={(item) => { const longitude = Number(item.payload.longitude); const latitude = Number(item.payload.latitude); if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return; setAdminOpen(false); setFocusRequest({ feature: { type: 'Feature', geometry: { type: 'Point', coordinates: [longitude, latitude] }, properties: { id: item.id, name: String(item.payload.name || '待审核点位'), province: String(item.payload.province || ''), city: String(item.payload.city || ''), address: String(item.payload.address || ''), desc: String(item.payload.desc || ''), image: String(item.payload.image_url || ''), verificationStatus: 'user_verified' } }, nonce: Date.now() }); }} />}
      {accountOpen && auth.user && <MyContributionsPanel email={auth.user.email ?? '已登录用户'} onClose={() => setAccountOpen(false)} onSignOut={async () => { await auth.signOut(); setAccountOpen(false); }} />}
    </main>
  );
}

export default App;
