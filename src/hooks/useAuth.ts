import { useEffect, useState } from 'react';
import { pocketbase, type PbAuthRecord } from '../lib/pocketbase';

export interface AuthState {
  user: PbAuthRecord | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<PbAuthRecord | null>(pocketbase?.authStore.record ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pocketbase) {
      setLoading(false);
      return undefined;
    }
    setUser(pocketbase.authStore.record);
    setLoading(false);
    const unsubscribe = pocketbase.authStore.onChange((record) => setUser(record));
    return () => {
      unsubscribe();
    };
  }, []);

  const isAdmin = user?.role === 'admin';

  const signIn = async (email: string, password: string) => {
    if (!pocketbase) return { error: '尚未配置 PocketBase 登录服务' };
    try {
      await pocketbase.collection('users').authWithPassword(email.trim(), password);
      return { error: null };
    } catch (error) {
      return { error: translateAuthError(error instanceof Error ? error.message : '登录失败') };
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    if (!pocketbase) return { error: '尚未配置 PocketBase 登录服务' };
    const normalizedUsername = username.trim();
    if (normalizedUsername.length < 2 || normalizedUsername.length > 24) return { error: '用户名需要 2 至 24 个字符' };
    try {
      await pocketbase.collection('users').create({
        email: email.trim(),
        password,
        passwordConfirm: password,
        username: normalizedUsername,
        role: 'user',
        emailVisibility: true,
      });
      await pocketbase.collection('users').authWithPassword(email.trim(), password);
      return { error: null };
    } catch (error) {
      return { error: translateAuthError(error instanceof Error ? error.message : '注册失败') };
    }
  };

  const signOut = async () => {
    pocketbase?.clearAuth();
  };

  return { user, isAdmin, loading, signIn, signUp, signOut };
}

function translateAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login') || normalized.includes('failed to authenticate')) return '邮箱或密码不正确';
  if (normalized.includes('already exists') || normalized.includes('unique') || normalized.includes('duplicate')) return '该邮箱已注册，请直接登录';
  if (normalized.includes('password') && normalized.includes('at least')) return '密码至少需要 8 位';
  if (normalized.includes('validation') && normalized.includes('email')) return '邮箱格式不正确';
  if (normalized.includes('rate limit') || normalized.includes('too many')) return '请求过于频繁，请稍后再试';
  return message;
}
