/**
 * 将 Supabase 存量数据迁移到 PocketBase。
 *
 * 用法：
 *   $env:PB_URL='https://www.u2463609.nyat.app:25649'
 *   $env:PB_SUPERUSER_EMAIL='deqiangli23@gmail.com'
 *   $env:PB_SUPERUSER_PASSWORD='...'
 *   # 可选：需要完整用户/投稿时提供 Supabase service_role
 *   $env:SUPABASE_URL='https://xxx.supabase.co'
 *   $env:SUPABASE_SERVICE_ROLE_KEY='...'
 *   $env:SUPABASE_ANON_KEY='...'   # 仅公开数据时可用
 *   node scripts/migrate-supabase-to-pocketbase.mjs
 *
 * 已导出的 data/supabase-statues.json 会被优先使用。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PB_URL = (process.env.PB_URL || 'https://www.u2463609.nyat.app:25649').replace(/\/+$/, '');
const PB_EMAIL = process.env.PB_SUPERUSER_EMAIL || 'deqiangli23@gmail.com';
const PB_PASSWORD = process.env.PB_SUPERUSER_PASSWORD || '';
const SUPA_URL = (process.env.SUPABASE_URL || 'https://ppcrgvgiotfdcwnzmvpx.supabase.co').replace(/\/+$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_4BSD1gRmZ4rzNQxo-cefVQ_Lzwgst65';
const DEFAULT_PASSWORD = process.env.MIGRATED_USER_PASSWORD || 'mao123456';

async function pb(pathname, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  let payload = form;
  if (body !== undefined && !form) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${PB_URL}/api${pathname}`, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }
  if (!response.ok) {
    const message = data?.message || `HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function supa(pathname) {
  const response = await fetch(`${SUPA_URL}/rest/v1/${pathname}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) throw new Error(typeof data === 'string' ? data : data?.message || `HTTP ${response.status}`);
  return data;
}

async function loadStatues() {
  try {
    const raw = await readFile('data/supabase-statues.json', 'utf8');
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length) return list;
  } catch { /* fall through */ }
  return supa('statues?select=*&limit=2000');
}

async function loadContributors() {
  try {
    const raw = await readFile('data/supabase-contributors.json', 'utf8');
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list;
  } catch { /* fall through */ }
  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/rpc/public_statue_contributors`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

async function loadUsers() {
  // service_role 才能读 auth.users / profiles
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const profiles = await supa('profiles?select=*&limit=5000');
    return profiles;
  } catch (error) {
    console.warn('读取 profiles 失败：', error.message);
    return [];
  }
}

async function loadContributions() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    return await supa('contributions?select=*&limit=5000');
  } catch (error) {
    console.warn('读取 contributions 失败：', error.message);
    return [];
  }
}

const auth = await pb('/collections/_superusers/auth-with-password', {
  method: 'POST',
  body: { identity: PB_EMAIL, password: PB_PASSWORD },
});
const token = auth.token;
console.log('PocketBase 超管已登录');

const collections = await pb('/collections?perPage=50', { token });
const statuesCol = collections.items.find((c) => c.name === 'statues');
const contribCol = collections.items.find((c) => c.name === 'contributions');
const usersCol = collections.items.find((c) => c.name === 'users');
if (!statuesCol || !contribCol || !usersCol) {
  throw new Error('缺少 statues/contributions/users 集合，请先完成 PocketBase 建表');
}

const existingStatues = await pb(`/collections/${statuesCol.id}/records?perPage=500`, { token });
const byExternal = new Map(existingStatues.items.filter((s) => s.external_id).map((s) => [s.external_id, s]));

const contributors = await loadContributors();
const contributorsByStatueId = new Map(contributors.map((row) => [row.statue_id, row.contributor_names || []]));

const statues = await loadStatues();
console.log(`待迁移点位：${statues.length}`);

let created = 0;
let updated = 0;
const externalToPb = new Map();

for (const row of statues) {
  const names = contributorsByStatueId.get(row.id) || [];
  const body = {
    external_id: row.external_id || row.id,
    name: row.name,
    province: row.province,
    city: row.city,
    address: row.address,
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    desc: row.desc ?? '',
    background: row.background ?? '',
    year: row.year ?? '',
    image_url: row.image_url ?? '',
    source: row.source ?? 'Supabase 迁移',
    verification_status: row.verification_status || 'verified',
    status: row.status || 'approved',
    contributor_names: names,
  };
  const existing = byExternal.get(body.external_id);
  try {
    if (existing) {
      await pb(`/collections/${statuesCol.id}/records/${existing.id}`, { method: 'PATCH', token, body });
      externalToPb.set(body.external_id, existing.id);
      updated += 1;
    } else {
      const createdRecord = await pb(`/collections/${statuesCol.id}/records`, { method: 'POST', token, body });
      byExternal.set(body.external_id, createdRecord);
      externalToPb.set(body.external_id, createdRecord.id);
      created += 1;
    }
  } catch (error) {
    console.warn('点位失败', body.name, error.message);
  }
}
console.log(`点位完成：新建 ${created}，更新 ${updated}`);

// 用户迁移（需要 service_role）
const users = await loadUsers();
console.log(`待迁移用户：${users.length}`);
const emailToPb = new Map();
for (const profile of users) {
  const email = profile.email;
  if (!email) continue;
  try {
    const createdUser = await pb(`/collections/${usersCol.id}/records`, {
      method: 'POST',
      token,
      body: {
        email,
        emailVisibility: true,
        password: DEFAULT_PASSWORD,
        passwordConfirm: DEFAULT_PASSWORD,
        username: profile.username || email.split('@')[0],
        role: profile.role === 'admin' ? 'admin' : 'user',
        verified: true,
      },
    });
    emailToPb.set(email.toLowerCase(), createdUser.id);
    console.log('用户已创建', email, '默认密码', DEFAULT_PASSWORD);
  } catch (error) {
    if (String(error.message).toLowerCase().includes('already') || String(error.message).includes('unique')) {
      const list = await pb(`/collections/${usersCol.id}/records?filter=${encodeURIComponent(`email = '${email.replace(/'/g, "\\'")}'`)}`, { token });
      if (list.items[0]) emailToPb.set(email.toLowerCase(), list.items[0].id);
      console.log('用户已存在，跳过', email);
    } else {
      console.warn('用户失败', email, error.message);
    }
  }
}

// 投稿迁移（需要 service_role）
const contributions = await loadContributions();
console.log(`待迁移投稿：${contributions.length}`);
for (const row of contributions) {
  const userId = emailToPb.get(String(row.user_id || '').toLowerCase())
    || (await (async () => {
      // profiles.id 对应 auth.users.id，此处用 profile id 映射
      return null;
    })());
  const statueId = row.statue_id
    ? (externalToPb.get(String(row.statue_id)) || null)
    : null;
  try {
    await pb(`/collections/${contribCol.id}/records`, {
      method: 'POST',
      token,
      body: {
        kind: row.kind === 'edit_suggestion' ? 'edit_suggestion' : 'new_statue',
        user: userId || emailToPb.values().next().value,
        statue: statueId || undefined,
        external_id: row.payload?.external_id || '',
        name: row.payload?.name || '',
        province: row.payload?.province || '',
        city: row.payload?.city || '',
        address: row.payload?.address || '',
        longitude: Number(row.payload?.longitude || 0),
        latitude: Number(row.payload?.latitude || 0),
        desc: row.payload?.desc || '',
        background: row.payload?.background || '',
        year: row.payload?.year || '',
        image_url: row.payload?.image_url || '',
        payload: row.payload || {},
        status: row.status === 'pending_review' ? 'pending_review' : row.status === 'approved' ? 'approved' : row.status === 'rejected' ? 'rejected' : 'archived',
        review_comment: row.review_comment || '',
      },
    });
  } catch (error) {
    console.warn('投稿失败', row.id, error.message);
  }
}

await mkdir('data', { recursive: true });
await writeFile('data/pocketbase-migration-report.json', JSON.stringify({
  migratedStatues: statues.length,
  migratedUsers: users.length,
  migratedContributions: contributions.length,
  defaultUserPassword: process.env.SUPABASE_SERVICE_ROLE_KEY ? DEFAULT_PASSWORD : null,
  note: process.env.SUPABASE_SERVICE_ROLE_KEY
    ? '用户已迁移，默认密码见 MIGRATED_USER_PASSWORD（默认 mao123456），请通知用户尽快修改。'
    : '未提供 SUPABASE_SERVICE_ROLE_KEY，仅迁移了公开点位。补充 service_role 后重跑可迁移用户与投稿。',
}, null, 2), 'utf8');

console.log('迁移报告：data/pocketbase-migration-report.json');
