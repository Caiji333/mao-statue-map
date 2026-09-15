import { ImagePlus, Link2, LoaderCircle, MapPin, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { StatueFeature } from '../types/statue';
import { findNearbyPendingContributions, resolveAmapShareUrl, type PendingContributionPreview } from '../lib/contributions';
import { ImagePreview } from './ImagePreview';

export interface ContributionInput { name: string; province: string; city: string; address: string; longitude: number; latitude: number; desc: string; background: string; year: string; photo: File | null; existingId?: string; existingDatabaseId?: string; }
interface Props { onClose: () => void; onSubmit: (input: ContributionInput) => Promise<string | null>; nearby: StatueFeature[]; existingFeature?: StatueFeature; initialCoordinates?: [number, number]; }

export function ContributionDialog({ onClose, onSubmit, nearby, existingFeature, initialCoordinates }: Props) {
  const existing = existingFeature?.properties;
  const coordinates = existingFeature?.geometry.coordinates ?? initialCoordinates;
  const [form, setForm] = useState({ name: existing?.name ?? '', province: existing?.province ?? '', city: existing?.city ?? '', address: existing?.address ?? '', longitude: coordinates?.[0]?.toFixed(6) ?? '', latitude: coordinates?.[1]?.toFixed(6) ?? '', desc: existing?.desc ?? '', background: existing?.background ?? '', year: existing?.year ?? '' });
  const [photo, setPhoto] = useState<File | null>(null); const [error, setError] = useState(''); const [sending, setSending] = useState(false);
  const [pendingNearby, setPendingNearby] = useState<PendingContributionPreview[]>([]);
  const [amapUrl, setAmapUrl] = useState(''); const [resolvingAmap, setResolvingAmap] = useState(false); const [amapError, setAmapError] = useState('');
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSending(true); setError(''); const result = await onSubmit({ ...form, longitude: Number(form.longitude), latitude: Number(form.latitude), photo, existingId: existingFeature?.properties.id, existingDatabaseId: existingFeature?.properties.databaseId }); setSending(false); if (result) setError(result); else onClose(); };
  const closest = nearby.find((feature) => {
    if (existingFeature || !form.longitude || !form.latitude) return false;
    const [lng, lat] = feature.geometry.coordinates; const scale = Math.cos(Number(form.latitude) * Math.PI / 180);
    return Math.hypot((lng - Number(form.longitude)) * 111_320 * scale, (lat - Number(form.latitude)) * 110_540) <= 50;
  });
  useEffect(() => {
    if (existingFeature || !form.longitude || !form.latitude) { setPendingNearby([]); return; }
    const longitude = Number(form.longitude); const latitude = Number(form.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) { setPendingNearby([]); return; }
    const timer = window.setTimeout(() => { void findNearbyPendingContributions(longitude, latitude).then(setPendingNearby); }, 220);
    return () => window.clearTimeout(timer);
  }, [existingFeature, form.latitude, form.longitude]);
  const resolveAmap = async () => {
    setResolvingAmap(true); setAmapError('');
    const result = await resolveAmapShareUrl(amapUrl);
    setResolvingAmap(false);
    if (result.error || !result.data) { setAmapError(result.error || '高德链接解析失败'); return; }
    setForm((current) => ({ ...current, name: current.name || result.data!.name, address: current.address || result.data!.name, longitude: result.data!.longitude.toFixed(6), latitude: result.data!.latitude.toFixed(6) }));
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="contribution-modal" role="dialog" aria-modal="true">
    <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button><div className="modal-kicker">{existingFeature ? '修改建议' : '新增点位'}</div><h2>{existingFeature ? '修订点位资料' : '补充一处雕像点位'}</h2>
    <p className="modal-copy">提交后进入管理员审核。{existingFeature ? '审核通过后替换公开资料。' : '坐标 50 米内已有点位时不能重复提交。'}</p>
    <div className="amap-resolver"><label>高德地图分享内容<div><Link2 size={15} /><input type="text" value={amapUrl} onChange={(event) => setAmapUrl(event.target.value)} placeholder="粘贴分享链接或包含链接的整段文字" /><button type="button" disabled={!amapUrl.trim() || resolvingAmap} onClick={() => void resolveAmap()}>{resolvingAmap ? <LoaderCircle className="spin" size={15} /> : '解析'}</button></div></label>{amapError && <small>{amapError}</small>}</div>
    {closest && <div className="duplicate-warning"><MapPin size={16} /><span>50 米内已有已公开点位“{closest.properties.name}”，请改为提交该点位的资料修改建议。</span></div>}
    {pendingNearby.length > 0 && <div className="pending-warning"><MapPin size={16} /><div><strong>附近已有待审核投稿</strong><small>这些内容尚未公开，仅供你查看，不能进行审核操作。</small>{pendingNearby.map((item) => <details key={item.id} className="pending-preview"><summary>{item.payload.name || '未命名点位'} · {Math.round(item.distance_m)} 米</summary><p>{[item.payload.province, item.payload.city, item.payload.address].filter(Boolean).join(' · ')}</p>{item.payload.desc && <p>{item.payload.desc}</p>}{item.payload.image_url && <ImagePreview src={item.payload.image_url} alt="待审核投稿现场" />}<small>提交时间：{new Date(item.created_at).toLocaleString('zh-CN')}</small></details>)}</div></div>}
    <form className="contribution-form" onSubmit={submit}>
      <div className="form-grid two"><label>雕像名称<input required maxLength={80} value={form.name} onChange={(e) => update('name', e.target.value)} /></label><label>落成年份<input maxLength={20} value={form.year} onChange={(e) => update('year', e.target.value)} /></label></div>
      <div className="form-grid three"><label>省份<input required maxLength={30} value={form.province} onChange={(e) => update('province', e.target.value)} /></label><label>城市<input required maxLength={30} value={form.city} onChange={(e) => update('city', e.target.value)} /></label><label>详细地址<input required maxLength={160} value={form.address} onChange={(e) => update('address', e.target.value)} /></label></div>
      <div className="form-grid two"><label>经度（GCJ-02）<input required min="73" max="136" type="number" step="any" value={form.longitude} onChange={(e) => update('longitude', e.target.value)} /></label><label>纬度（GCJ-02）<input required min="3" max="54" type="number" step="any" value={form.latitude} onChange={(e) => update('latitude', e.target.value)} /></label></div>
      <label>简介<textarea rows={2} maxLength={800} value={form.desc} onChange={(e) => update('desc', e.target.value)} /></label><label>建造背景<textarea rows={2} maxLength={800} value={form.background} onChange={(e) => update('background', e.target.value)} /></label>
      <label className="file-field"><ImagePlus size={16} />现场照片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /><small>{photo?.name ?? '可选，最大 5MB'}</small></label>
      {error && <p className="form-error">{error}</p>}<div className="modal-actions"><button className="modal-secondary" type="button" onClick={onClose}>取消</button><button className="modal-primary" disabled={sending || Boolean(closest) || pendingNearby.length > 0} type="submit">{sending ? '提交中…' : '提交审核'}</button></div>
    </form>
  </section></div>;
}
