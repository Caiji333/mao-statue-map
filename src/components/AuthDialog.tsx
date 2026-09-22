import { KeyRound, LogIn, UserPlus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { hasPocketBase } from '../lib/pocketbase';

interface Props {
  onClose: () => void;
  onAuthenticated?: () => void;
  onSignIn: (email: string, password: string) => Promise<{ error: string | null }>;
  onSignUp: (email: string, password: string, username: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
}

export function AuthDialog({ onClose, onAuthenticated, onSignIn, onSignUp }: Props) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
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
      if (result.error) setError(result.error); else (onAuthenticated ?? onClose)();
      return;
    }
    const result = await onSignUp(email, password, username);
    setSubmitting(false);
    if (result.error) setError(result.error);
    else if (result.needsEmailConfirmation) setRegistered(true);
    else (onAuthenticated ?? onClose)();
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
      <div className="auth-icon">{mode === 'signIn' ? <LogIn size={22} /> : <UserPlus size={22} />}</div><div className="modal-kicker">贡献入口</div>
      <h2 id="auth-title">登录后参与资料补充</h2>
      {registered ? <><p className="modal-copy">账号已创建。当前项目开启了邮箱确认，请打开 <strong>{email}</strong> 的确认邮件后再登录。</p><button className="modal-primary" type="button" onClick={() => { setRegistered(false); setMode('signIn'); }}>返回登录</button></> : <>
        <p className="modal-copy">{mode === 'signIn' ? '登录后可以提交点位、补充资料和上传现场照片。' : '注册后即可参与资料补充，所有贡献都需要管理员审核后才会公开。'}</p>
        <form onSubmit={submit}>{mode === 'signUp' && <label><span className="password-label"><span>用户名</span><small>2 至 24 个字符</small></span><input type="text" required minLength={2} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入用户名" autoComplete="username" autoFocus /></label>}<label>邮箱地址<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoFocus={mode === 'signIn'} /></label>
          <label><span className="password-label"><span>密码</span><small>至少 6 位</small></span><input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} /></label>
          {error && <p className="form-error">{error}</p>}{!hasPocketBase && <p className="form-hint">尚未配置 PocketBase，当前只能浏览地图。</p>}
          <button className="modal-primary" disabled={submitting || !hasPocketBase} type="submit">{submitting ? '处理中…' : mode === 'signIn' ? '登录' : '注册'}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError(''); }}>{mode === 'signIn' ? <><UserPlus size={15} />还没有账号？注册</> : <><KeyRound size={15} />已有账号？登录</>}</button>
      </>}
    </section>
  </div>;
}
