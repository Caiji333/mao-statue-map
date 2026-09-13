import { Check, Clock3, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Submission {
  id: string;
  kind: 'new_statue' | 'edit_suggestion';
  payload: Record<string, string | number>;
  created_at: string;
}

interface Props { onClose: () => void; onChanged: () => void; }

export function AdminPanel({ onClose, onChanged }: Props) {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const load = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('contributions').select('id,kind,payload,created_at').eq('status', 'pending_review').order('created_at');
    setItems((data ?? []) as Submission[]); setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const decide = async (item: Submission, status: 'approved' | 'rejected') => {
    if (!supabase) return;
    setBusy(item.id);
    const comment = comments[item.id]?.trim() || (status === 'approved' ? '管理员审核通过' : '管理员驳回');
    const { error } = await supabase.rpc('review_contribution', { contribution_id: item.id, next_status: status, comment });
    if (error) window.alert(error.message); else { await load(); onChanged(); }
    setBusy('');
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="admin-modal" role="dialog" aria-modal="true">
    <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button><div className="modal-kicker">管理员工作台</div><h2>待审核贡献 <span className="admin-count">{items.length}</span></h2><p className="modal-copy">审核通过后立即公开，驳回记录不会出现在地图。</p>
    {loading ? <div className="admin-empty"><Clock3 size={18} />读取审核队列…</div> : items.length === 0 ? <div className="admin-empty"><Check size={20} />当前没有待审核内容</div> : <div className="review-list">{items.map((item) => <article className="review-item" key={item.id}><div className="review-item-head"><strong>{String(item.payload.name || '未命名点位')}</strong><small>{item.kind === 'new_statue' ? '新增点位' : '修改建议'} · {new Date(item.created_at).toLocaleDateString('zh-CN')}</small></div><p>{[item.payload.province, item.payload.city, item.payload.address].filter(Boolean).join(' · ')}</p><p>{String(item.payload.desc || '未填写简介')}</p>{item.payload.image_url && <img className="review-photo" src={String(item.payload.image_url)} alt="投稿现场" />}<small>坐标：{item.payload.longitude}, {item.payload.latitude}</small><input className="review-comment" value={comments[item.id] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="审核意见（可选）" maxLength={300} /><div className="review-actions"><button disabled={busy === item.id} className="review-reject" type="button" onClick={() => void decide(item, 'rejected')}><XCircle size={15} />驳回</button><button disabled={busy === item.id} className="review-approve" type="button" onClick={() => void decide(item, 'approved')}><Check size={15} />通过并公开</button></div></article>)}</div>}
  </section></div>;
}
