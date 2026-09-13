import { KeyRound, LogIn, UserPlus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { hasSupabase } from '../lib/supabase';

interface Props {
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<{ error: string | null }>;
  onSignUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
}

export function AuthDialog({ onClose, onSignIn, onSignUp }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError('');
    if (mode === 'signIn') {
      const result = await onSignIn(email, password);
      setSubmitting(false);
      if (result.error) setError(result.error); else onClose();
      return;
    }
    const result = await onSignUp(email, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
    else if (result.needsEmailConfirmation) setRegistered(true);
    else onClose();
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
      <div className="auth-icon">{mode === 'signIn' ? <LogIn size={22} /> : <UserPlus size={22} />}</div><div className="modal-kicker">贡献入口</div>
      <h2 id="auth-title">登录后参与资料补充</h2>
      {registered ? <><p className="modal-copy">账号已创建。当前项目开启了邮箱确认，请打开 <strong>{email}</strong> 的确认邮件后再登录。</p><button className="modal-primary" type="button" onClick={() => { setRegistered(false); setMode('signIn'); }}>返回登录</button></> : <>
        <p className="modal-copy">{mode === 'signIn' ? '登录后可以提交点位、补充资料和上传现场照片。' : '注册后即可参与资料补充，所有贡献都需要管理员审核后才会公开。'}</p>
        <form onSubmit={submit}><label>邮箱地址<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoFocus /></label>
          <label><span className="password-label"><span>密码</span><small>至少 6 位</small></span><input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} /></label>
          {error && <p className="form-error">{error}</p>}{!hasSupabase && <p className="form-hint">尚未配置 Supabase，当前只能浏览地图。</p>}
          <button className="modal-primary" disabled={submitting || !hasSupabase} type="submit">{submitting ? '处理中…' : mode === 'signIn' ? '登录' : '注册'}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError(''); }}>{mode === 'signIn' ? <><UserPlus size={15} />还没有账号？注册</> : <><KeyRound size={15} />已有账号？登录</>}</button>
      </>}
    </section>
  </div>;
}
