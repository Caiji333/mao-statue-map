import { Mail, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { hasSupabase } from '../lib/supabase';

interface Props {
  onClose: () => void;
  onSignIn: (email: string) => Promise<{ error: string | null }>;
}

export function AuthDialog({ onClose, onSignIn }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSending(true); setError('');
    const result = await onSignIn(email); setSending(false);
    if (result.error) setError(result.error); else setSent(true);
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
      <div className="auth-icon"><Mail size={22} /></div><div className="modal-kicker">贡献入口</div>
      <h2 id="auth-title">登录后参与资料补充</h2>
      {sent ? <><p className="modal-copy">登录链接已发送到 <strong>{email}</strong>，请打开邮件完成登录。</p><button className="modal-primary" type="button" onClick={onClose}>知道了</button></> : <>
        <p className="modal-copy">无需设置密码。所有贡献都需要管理员审核后才会公开。</p>
        <form onSubmit={submit}><label>邮箱地址<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoFocus /></label>
          {error && <p className="form-error">{error}</p>}{!hasSupabase && <p className="form-hint">尚未配置 Supabase，当前只能浏览地图。</p>}
          <button className="modal-primary" disabled={sending || !hasSupabase} type="submit">{sending ? '发送中…' : '发送登录链接'}</button>
        </form>
      </>}
    </section>
  </div>;
}
