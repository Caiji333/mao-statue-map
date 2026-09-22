import { CheckCircle2, Clock3, KeyRound, LogOut, UserRoundPen, X, XCircle } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  listMyContributions,
  updateMyPassword,
  updateMyUsername,
  type ContributionListItem,
} from '../lib/contributions';
import { pocketbase } from '../lib/pocketbase';

interface Props { email: string; onClose: () => void; onSignOut: () => Promise<void>; }
const statusText = { pending_review: '待审核', approved: '已通过', rejected: '已驳回', archived: '已下线' } as const;

export function MyContributionsPanel({ email, onClose, onSignOut }: Props) {
  const [items, setItems] = useState<ContributionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const userId = pocketbase?.authStore.record?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    setUsername(pocketbase?.authStore.record?.username ?? '');
    void listMyContributions(userId).then((list) => {
      setItems(list);
      setLoading(false);
    });
  }, []);

  const saveUsername = async (event: FormEvent) => {
    event.preventDefault();
    setUsernameMessage('');
    const normalized = username.trim();
    if (normalized.length < 2 || normalized.length > 24) {
      setUsernameMessage('用户名需要 2 至 24 个字符');
      return;
    }
    setSavingUsername(true);
    const error = await updateMyUsername(normalized);
    setSavingUsername(false);
    if (error) {
      setUsernameMessage(error.includes('用户名') ? error : '用户名修改失败，请稍后重试');
      return;
    }
    setUsername(normalized);
    setUsernameOpen(false);
    setUsernameMessage('用户名已更新');
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage('');
    if (password.length < 6) {
      setPasswordMessage('密码至少需要 6 位');
      return;
    }
    if (password !== passwordAgain) {
      setPasswordMessage('两次输入的密码不一致');
      return;
    }
    setSavingPassword(true);
    const error = await updateMyPassword(password);
    setSavingPassword(false);
    if (error) {
      setPasswordMessage(error);
      return;
    }
    setPassword('');
    setPasswordAgain('');
    setPasswordOpen(false);
    setPasswordMessage('密码已更新');
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="account-modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        <div className="modal-kicker">我的账户</div>
        <h2>贡献记录</h2>
        <div className="account-email">
          <span>{email}</span>
          <div>
            <button type="button" onClick={() => { setUsernameOpen((value) => !value); setPasswordOpen(false); setUsernameMessage(''); setPasswordMessage(''); }}>
              <UserRoundPen size={14} />修改用户名
            </button>
            <button type="button" onClick={() => { setPasswordOpen((value) => !value); setUsernameOpen(false); setPasswordMessage(''); setUsernameMessage(''); }}>
              <KeyRound size={14} />修改密码
            </button>
            <button type="button" onClick={() => void onSignOut()}><LogOut size={14} />退出登录</button>
          </div>
        </div>

        {usernameOpen && (
          <form className="password-form username-form" onSubmit={saveUsername}>
            <label>新用户名<input required minLength={2} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
            <button className="modal-primary" type="submit" disabled={savingUsername}>{savingUsername ? '保存中…' : '保存用户名'}</button>
          </form>
        )}
        {usernameMessage && <p className={usernameMessage === '用户名已更新' ? 'form-success' : 'form-error'}>{usernameMessage}</p>}

        {passwordOpen && (
          <form className="password-form" onSubmit={savePassword}>
            <label>新密码<input type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
            <label>再次输入<input type="password" minLength={6} required value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} autoComplete="new-password" /></label>
            <button className="modal-primary" type="submit" disabled={savingPassword}>{savingPassword ? '保存中…' : '保存密码'}</button>
          </form>
        )}
        {passwordMessage && <p className={passwordMessage === '密码已更新' ? 'form-success' : 'form-error'}>{passwordMessage}</p>}

        {loading ? (
          <div className="admin-empty"><Clock3 size={18} />读取贡献记录…</div>
        ) : items.length === 0 ? (
          <div className="admin-empty"><CheckCircle2 size={18} />还没有提交过贡献</div>
        ) : (
          <div className="review-list">
            {items.map((item) => (
              <article className="review-item" key={item.id}>
                <div className="review-item-head">
                  <strong>{String(item.payload.name || '未命名点位')}</strong>
                  <small>{item.kind === 'new_statue' ? '新增点位' : '修改建议'} · {new Date(item.created_at).toLocaleString('zh-CN')}</small>
                </div>
                <div className={`review-result ${item.status}`}>
                  <span>{statusText[item.status] ?? item.status}</span>
                </div>
                <p>{[item.payload.province, item.payload.city, item.payload.address].filter(Boolean).join(' · ')}</p>
                {item.payload.image_url && <img className="review-photo" src={String(item.payload.image_url)} alt="投稿现场" />}
                <small>坐标：{String(item.payload.longitude)}, {String(item.payload.latitude)}</small>
                {item.review_comment && item.status !== 'pending_review' && (
                  <p className="review-comment-text">审核意见：{item.review_comment}</p>
                )}
                {item.status === 'rejected' && <XCircle size={14} />}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
