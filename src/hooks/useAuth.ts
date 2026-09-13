import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshRole = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('role').single();
    setIsAdmin(data?.role === 'admin');
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (data.session) void refreshRole();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (nextSession) void refreshRole();
      else setIsAdmin(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: '尚未配置 Supabase 登录服务' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? translateAuthError(error.message) : null };
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) return { error: '尚未配置 Supabase 登录服务' };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: translateAuthError(error.message) };
    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return { user: session?.user ?? null, isAdmin, loading, signIn, signUp, signOut };
}

function translateAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return '邮箱或密码不正确';
  if (normalized.includes('user already registered')) return '该邮箱已注册，请直接登录';
  if (normalized.includes('password should be at least')) return '密码至少需要 6 位';
  if (normalized.includes('email not confirmed')) return '邮箱尚未确认，请先完成邮箱确认';
  if (normalized.includes('rate limit')) return '请求过于频繁，请稍后再试';
  return message;
}
