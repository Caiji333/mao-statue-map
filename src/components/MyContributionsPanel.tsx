import { CheckCircle2, Clock3, KeyRound, LogOut, X, XCircle } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Item { id: string; kind: 'new_statue' | 'edit_suggestion'; payload: Record<string, string>; status: 'pending_review' | 'approved' | 'rejected' | 'archived'; review_comment: string | null; created_at: string; }
interface Props { email: string; onClose: () => void; onSignOut: () => Promise<void>; }
const statusText = { pending_review: '待审核', approved: '已通过', rejected: '已驳回', archived: '已下线' } as const;

export function MyContributionsPanel({ email, onClose, onSignOut }: Props) {
  const [items, setItems] = useState<Item[]>([]); const [loading, setLoading] = useState(true);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  useEffect(() => { if (!supabase) return; void supabase.from('contributions').select('id,kind,payload,status,review_comment,created_at').order('created_at', { ascending: false }).then(({ data }) => { setItems((data ?? []) as Item[]); setLoading(false); }); }, []);
  const savePassword = async (event: FormEvent) => {
    event.preventDefault(); setPasswordMessage('');
    if (password.length < 6) { setPasswordMessage('密码至少需要 6 位'); return; }
    if (password !== passwordAgain) { setPasswordMessage('两次输入的密码不一致'); return; }
    if (!supabase) return;
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) { setPasswordMessage(error.message); return; }
    setPassword(''); setPasswordAgain(''); setPasswordOpen(false); setPasswordMessage('密码已更新');
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="account-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button><div className="modal-kicker">我的账户</div><h2>贡献记录</h2><div className="account-email"><span>{email}</span><div><button type="button" onClick={() => { setPasswordOpen((value) => !value); setPasswordMessage(''); }}><KeyRound size={14} />修改密码</button><button type="button" onClick={() => void onSignOut()}><LogOut size={14} />退出登录</button></div></div>{passwordOpen && <form className="password-form" onSubmit={savePassword}><label>新密码<input type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label>再次输入<input type="password" minLength={6} required value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} autoComplete="new-password" /></label><button className="modal-primary" type="submit" disabled={savingPassword}>{savingPassword ? '保存中…' : '保存密码'}</button></form>}{passwordMessage && <p className={passwordMessage === '密码已更新' ? 'form-success' : 'form-error'}>{passwordMessage}</p>}{loading ? <div className="admin-empty"><Clock3 size={18} />读取记录…</div> : items.length === 0 ? <div className="admin-empty">尚未提交过点位资料</div> : <div className="review-list">{items.map((item) => <article className="contribution-history" key={item.id}><span className={`history-status ${item.status}`}>{item.status === 'approved' ? <CheckCircle2 size={14} /> : item.status === 'rejected' ? <XCircle size={14} /> : <Clock3 size={14} />}{statusText[item.status]}</span><div><strong>{item.payload.name || '未命名点位'}</strong><small>{item.kind === 'new_statue' ? '新增点位' : '修改建议'} · {new Date(item.created_at).toLocaleString('zh-CN')}</small>{item.review_comment && <p>审核意见：{item.review_comment}</p>}</div></article>)}</div>}</section></div>;
}
