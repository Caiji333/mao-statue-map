import { Check, ChevronLeft, ChevronRight, Clock3, KeyRound, MapPin, Search, Users, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Submission {
  id: string;
  kind: 'new_statue' | 'edit_suggestion';
  payload: Record<string, string | number>;
  status: 'pending_review' | 'approved' | 'rejected';
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Props { onClose: () => void; onChanged: () => void; onLocate: (item: Submission) => void; }
interface AdminUser { id: string; email: string | null; role: 'user' | 'admin'; created_at: string; }

const PAGE_SIZE = 10;

export function AdminPanel({ onClose, onChanged, onLocate }: Props) {
  const [tab, setTab] = useState<'reviews' | 'users'>('reviews');
  const [reviewView, setReviewView] = useState<'pending' | 'reviewed'>('pending');
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewReload, setReviewReload] = useState(0);
  const [items, setItems] = useState<Submission[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resetting, setResetting] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  useEffect(() => {
    if (tab !== 'reviews' || !supabase) return;
    const client = supabase;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const from = (reviewPage - 1) * PAGE_SIZE;
      let request = client
        .from('contributions')
        .select('id,kind,payload,status,review_comment,reviewed_at,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      request = reviewView === 'pending'
        ? request.eq('status', 'pending_review')
        : request.in('status', ['approved', 'rejected']);
      const { data, count } = await request;
      if (cancelled) return;
      setItems((data ?? []) as Submission[]);
      setTotalItems(count ?? 0);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [reviewPage, reviewReload, reviewView, tab]);

  useEffect(() => {
    if (tab !== 'users' || !supabase) return;
    const client = supabase;
    const timer = window.setTimeout(async () => {
      setUserLoading(true); setUserMessage('');
      let request = client.from('profiles').select('id,email,role,created_at').order('created_at', { ascending: false }).limit(100);
      if (query.trim()) request = request.ilike('email', `%${query.trim()}%`);
      const { data, error } = await request;
      setUsers((data ?? []) as AdminUser[]);
      if (error) setUserMessage(error.message);
      setUserLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, tab]);

  const changeReviewView = (next: 'pending' | 'reviewed') => {
    setReviewView(next);
    setReviewPage(1);
  };

  const decide = async (item: Submission, status: 'approved' | 'rejected') => {
    if (!supabase) return;
    setBusy(item.id);
    const comment = comments[item.id]?.trim() || (status === 'approved' ? '管理员审核通过' : '管理员驳回');
    const { error } = await supabase.rpc('review_contribution', { contribution_id: item.id, next_status: status, comment });
    if (error) window.alert(error.message);
    else {
      if (items.length === 1 && reviewPage > 1) setReviewPage((current) => current - 1);
      else setReviewReload((current) => current + 1);
      onChanged();
    }
    setBusy('');
  };

  const resetPassword = async (user: AdminUser) => {
    if (!supabase || !window.confirm(`确认将 ${user.email ?? '该用户'} 的密码重置为 mao123456？`)) return;
    setResetting(user.id); setUserMessage('');
    const { error } = await supabase.rpc('admin_reset_user_password', { p_user_id: user.id });
    setResetting('');
    setUserMessage(error ? error.message : `${user.email ?? '用户'} 的密码已重置为 mao123456`);
  };

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="admin-modal" role="dialog" aria-modal="true">
    <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button><div className="modal-kicker">管理员工作台</div><h2>{tab === 'reviews' ? '投稿审核' : '用户管理'}</h2>
    <div className="admin-tabs"><button type="button" className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}><Clock3 size={15} />投稿审核</button><button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={15} />用户管理</button></div>
    {tab === 'reviews' ? <>
      <div className="review-view-tabs"><button type="button" className={reviewView === 'pending' ? 'active' : ''} onClick={() => changeReviewView('pending')}>待审核贡献</button><button type="button" className={reviewView === 'reviewed' ? 'active' : ''} onClick={() => changeReviewView('reviewed')}>已审核贡献</button></div>
      <p className="modal-copy">{reviewView === 'pending' ? '审核通过后立即公开，驳回记录不会出现在地图。' : '展示已经通过或驳回的历史审核记录。'}</p>
      {loading ? <div className="admin-empty"><Clock3 size={18} />读取贡献记录…</div> : items.length === 0 ? <div className="admin-empty"><Check size={20} />{reviewView === 'pending' ? '当前没有待审核内容' : '当前没有已审核内容'}</div> : <div className="review-list">{items.map((item) => <article className="review-item" key={item.id}><div className="review-item-head"><strong>{String(item.payload.name || '未命名点位')}</strong><small>{item.kind === 'new_statue' ? '新增点位' : '修改建议'} · {new Date(item.created_at).toLocaleString('zh-CN')}</small></div>{reviewView === 'reviewed' && <div className={`review-result ${item.status}`}><span>{item.status === 'approved' ? '已通过' : '已驳回'}</span><small>{item.reviewed_at ? new Date(item.reviewed_at).toLocaleString('zh-CN') : ''}</small></div>}<p>{[item.payload.province, item.payload.city, item.payload.address].filter(Boolean).join(' · ')}</p><p>{String(item.payload.desc || '未填写简介')}</p>{item.payload.image_url && <img className="review-photo" src={String(item.payload.image_url)} alt="投稿现场" />}<small>坐标：{item.payload.longitude}, {item.payload.latitude}</small>{item.review_comment && reviewView === 'reviewed' && <p className="review-comment-text">审核意见：{item.review_comment}</p>}<div className="review-actions"><button type="button" className="review-locate" onClick={() => onLocate(item)}><MapPin size={15} />查看位置</button>{reviewView === 'pending' && <><button disabled={busy === item.id} className="review-reject" type="button" onClick={() => void decide(item, 'rejected')}><XCircle size={15} />驳回</button><button disabled={busy === item.id} className="review-approve" type="button" onClick={() => void decide(item, 'approved')}><Check size={15} />通过并公开</button></>}</div>{reviewView === 'pending' && <input className="review-comment" value={comments[item.id] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="审核意见（可选）" maxLength={300} />}</article>)}</div>}
      <div className="review-pagination"><span>共 {totalItems} 条</span><div><button type="button" aria-label="上一页" title="上一页" disabled={reviewPage <= 1 || loading} onClick={() => setReviewPage((current) => current - 1)}><ChevronLeft size={16} /></button><span>第 {reviewPage} / {totalPages} 页</span><button type="button" aria-label="下一页" title="下一页" disabled={reviewPage >= totalPages || loading} onClick={() => setReviewPage((current) => current + 1)}><ChevronRight size={16} /></button></div></div>
    </> : <div className="user-admin"><div className="user-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按邮箱搜索账号" /></div>{userMessage && <p className={userMessage.includes('已重置') ? 'form-success' : 'form-error'}>{userMessage}</p>}{userLoading ? <div className="admin-empty"><Clock3 size={18} />读取用户列表…</div> : users.length === 0 ? <div className="admin-empty"><Users size={18} />没有匹配的用户</div> : <div className="user-list">{users.map((user) => <article className="user-row" key={user.id}><div><strong>{user.email ?? '未填写邮箱'}</strong><small>{new Date(user.created_at).toLocaleString('zh-CN')} · {user.role === 'admin' ? '管理员' : '普通用户'}</small></div><button type="button" disabled={resetting === user.id} onClick={() => void resetPassword(user)}><KeyRound size={14} />{resetting === user.id ? '重置中…' : '重置密码'}</button></article>)}</div>}</div>}
  </section></div>;
}
