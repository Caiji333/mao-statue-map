import { ImagePlus, MapPin, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { StatueFeature } from '../types/statue';

export interface ContributionInput { name: string; province: string; city: string; address: string; longitude: number; latitude: number; desc: string; background: string; year: string; photo: File | null; existingId?: string; }
interface Props { onClose: () => void; onSubmit: (input: ContributionInput) => Promise<string | null>; nearby: StatueFeature[]; existingFeature?: StatueFeature; }

export function ContributionDialog({ onClose, onSubmit, nearby, existingFeature }: Props) {
  const existing = existingFeature?.properties;
  const coordinates = existingFeature?.geometry.coordinates;
  const [form, setForm] = useState({ name: existing?.name ?? '', province: existing?.province ?? '', city: existing?.city ?? '', address: existing?.address ?? '', longitude: coordinates?.[0]?.toString() ?? '', latitude: coordinates?.[1]?.toString() ?? '', desc: existing?.desc ?? '', background: existing?.background ?? '', year: existing?.year ?? '' });
  const [photo, setPhoto] = useState<File | null>(null); const [error, setError] = useState(''); const [sending, setSending] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSending(true); setError(''); const result = await onSubmit({ ...form, longitude: Number(form.longitude), latitude: Number(form.latitude), photo, existingId: existingFeature?.properties.id }); setSending(false); if (result) setError(result); else onClose(); };
  const closest = nearby.find((feature) => {
    if (existingFeature || !form.longitude || !form.latitude) return false;
    const [lng, lat] = feature.geometry.coordinates; const scale = Math.cos(Number(form.latitude) * Math.PI / 180);
    return Math.hypot((lng - Number(form.longitude)) * 111_320 * scale, (lat - Number(form.latitude)) * 110_540) <= 50;
  });
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="contribution-modal" role="dialog" aria-modal="true">
    <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button><div className="modal-kicker">{existingFeature ? '修改建议' : '新增点位'}</div><h2>{existingFeature ? '修订点位资料' : '补充一处雕像点位'}</h2>
    <p className="modal-copy">提交后进入管理员审核。{existingFeature ? '审核通过后替换公开资料。' : '坐标 50 米内已有点位时不能重复提交。'}</p>
    {closest && <div className="duplicate-warning"><MapPin size={16} /><span>50 米内已有“{closest.properties.name}”，请改为提交该点位的资料修改建议。</span></div>}
    <form className="contribution-form" onSubmit={submit}>
      <div className="form-grid two"><label>雕像名称<input required maxLength={80} value={form.name} onChange={(e) => update('name', e.target.value)} /></label><label>落成年份<input maxLength={20} value={form.year} onChange={(e) => update('year', e.target.value)} /></label></div>
      <div className="form-grid three"><label>省份<input required maxLength={30} value={form.province} onChange={(e) => update('province', e.target.value)} /></label><label>城市<input required maxLength={30} value={form.city} onChange={(e) => update('city', e.target.value)} /></label><label>详细地址<input required maxLength={160} value={form.address} onChange={(e) => update('address', e.target.value)} /></label></div>
      <div className="form-grid two"><label>经度（GCJ-02）<input required min="73" max="136" type="number" step="any" value={form.longitude} onChange={(e) => update('longitude', e.target.value)} /></label><label>纬度（GCJ-02）<input required min="3" max="54" type="number" step="any" value={form.latitude} onChange={(e) => update('latitude', e.target.value)} /></label></div>
      <label>简介<textarea rows={2} maxLength={800} value={form.desc} onChange={(e) => update('desc', e.target.value)} /></label><label>建造背景<textarea rows={2} maxLength={800} value={form.background} onChange={(e) => update('background', e.target.value)} /></label>
      <label className="file-field"><ImagePlus size={16} />现场照片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /><small>{photo?.name ?? '可选，最大 5MB'}</small></label>
      {error && <p className="form-error">{error}</p>}<div className="modal-actions"><button className="modal-secondary" type="button" onClick={onClose}>取消</button><button className="modal-primary" disabled={sending || Boolean(closest)} type="submit">{sending ? '提交中…' : '提交审核'}</button></div>
    </form>
  </section></div>;
}
