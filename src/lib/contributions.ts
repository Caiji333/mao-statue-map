import { pocketbase, type PbAuthRecord, type PbRecord } from './pocketbase';
import type { ContributionInput } from '../components/ContributionDialog';
import type { StatueFeature, StatueProperties } from '../types/statue';

export interface PendingContributionPreview {
  id: string;
  payload: Record<string, string>;
  distance_m: number;
  created_at: string;
}
export interface AmapShareLocation { longitude: number; latitude: number; name: string }

export interface ContributionListItem {
  id: string;
  kind: 'new_statue' | 'edit_suggestion';
  payload: Record<string, string | number>;
  status: 'pending_review' | 'approved' | 'rejected' | 'archived';
  review_comment: string | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  user?: string;
  submitter_name?: string;
  reviewer_name?: string;
}

const CHINA_BOUNDS = { minLng: 73, maxLng: 136, minLat: 3, maxLat: 54 };

function distanceMeters(aLng: number, aLat: number, bLng: number, bLat: number) {
  const scale = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  return Math.hypot((bLng - aLng) * 111_320 * scale, (bLat - aLat) * 110_540);
}

function recordToPayload(record: PbRecord): Record<string, string> {
  const raw = record.payload;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]));
  }
  return {
    name: String(record.name ?? ''),
    province: String(record.province ?? ''),
    city: String(record.city ?? ''),
    address: String(record.address ?? ''),
    longitude: String(record.longitude ?? ''),
    latitude: String(record.latitude ?? ''),
    desc: String(record.desc ?? ''),
    background: String(record.background ?? ''),
    year: String(record.year ?? ''),
    image_url: String(record.image_url ?? ''),
    external_id: String(record.external_id ?? ''),
  };
}

function displayName(record: PbAuthRecord | PbRecord | null | undefined) {
  if (!record) return '';
  const username = String((record as PbRecord).username ?? '');
  const email = String((record as PbRecord).email ?? '');
  return username || email || '未设置用户名';
}

function photoUrl(record: PbRecord): string {
  const direct = String(record.image_url ?? '');
  if (direct) return direct;
  const photo = String(record.photo ?? '');
  return pocketbase && photo ? pocketbase.files('contributions', record, photo) : '';
}

export function mapContribution(record: PbRecord, users?: Map<string, PbAuthRecord>): ContributionListItem {
  const payload = recordToPayload(record);
  const image = photoUrl(record);
  if (image) payload.image_url = image;
  return {
    id: record.id,
    kind: record.kind as ContributionListItem['kind'],
    payload: { ...payload, longitude: Number(record.longitude ?? payload.longitude), latitude: Number(record.latitude ?? payload.latitude) },
    status: record.status as ContributionListItem['status'],
    review_comment: record.review_comment ? String(record.review_comment) : null,
    created_at: String(record.created ?? ''),
    reviewed_at: record.reviewed_at ? String(record.reviewed_at) : null,
    reviewed_by: record.reviewed_by ? String(record.reviewed_by) : null,
    user: record.user ? String(record.user) : '',
    submitter_name: users?.get(String(record.user)) ? displayName(users.get(String(record.user))) : undefined,
    reviewer_name: record.reviewed_by && users?.get(String(record.reviewed_by)) ? displayName(users.get(String(record.reviewed_by))) : undefined,
  };
}

async function loadUserMap(ids: string[]): Promise<Map<string, PbAuthRecord>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, PbAuthRecord>();
  const client = pocketbase;
  if (!client || unique.length === 0) return map;
  await Promise.all(unique.map(async (id) => {
    try {
      const user = await client.collection('users').getOne(id);
      map.set(id, user as unknown as PbAuthRecord);
    } catch {
      // ignore missing users
    }
  }));
  return map;
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export async function resolveAmapShareUrl(url: string): Promise<{ data: AmapShareLocation | null; error: string | null }> {
  // 1) 优先走 PocketBase 服务端解析（无 CORS，原 Edge Function 同款逻辑）
  if (pocketbase && pocketbase.authStore.token) {
    try {
      const response = await fetch(`${pocketbase.baseUrl}/api/resolve-amap-share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: pocketbase.authStore.token,
        },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json() as AmapShareLocation & { error?: string };
      if (response.ok && Number.isFinite(payload?.longitude)) {
        return { data: { longitude: payload.longitude, latitude: payload.latitude, name: String(payload.name ?? '') }, error: null };
      }
      // 服务端未配置钩子（404）时落到本地解析
      if (response.status !== 404 && payload?.error) {
        return { data: null, error: String(payload.error) };
      }
    } catch {
      // fall through to local parse
    }
  }

  // 2) 本地兜底：读链接坐标 / 提示手动填写
  const text = String(url ?? '').trim();
  const match = text.match(/https:\/\/(?:surl\.amap\.com|wb\.amap\.com|uri\.amap\.com|www\.amap\.com|amap\.com)\/[^\s<>\]）)，。]+/i);
  const extractLocation = (target: URL): AmapShareLocation | null => {
    const query = target.searchParams.get('q');
    if (query) {
      const [latitudeText, longitudeText, ...nameParts] = query.split(',');
      const latitude = Number(latitudeText);
      const longitude = Number(longitudeText);
      if (Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= CHINA_BOUNDS.minLng && longitude <= CHINA_BOUNDS.maxLng && latitude >= CHINA_BOUNDS.minLat && latitude <= CHINA_BOUNDS.maxLat) {
        return { longitude, latitude, name: nameParts.join(',').trim() };
      }
    }
    const position = target.searchParams.get('position');
    if (position) {
      const [longitudeText, latitudeText] = position.split(',');
      const longitude = Number(longitudeText);
      const latitude = Number(latitudeText);
      if (Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= CHINA_BOUNDS.minLng && longitude <= CHINA_BOUNDS.maxLng && latitude >= CHINA_BOUNDS.minLat && latitude <= CHINA_BOUNDS.maxLat) {
        return { longitude, latitude, name: '' };
      }
    }
    return null;
  };

  if (match) {
    try {
      const location = extractLocation(new URL(match[0]));
      if (location) return { data: location, error: null };
    } catch { /* ignore */ }
  }

  return {
    data: null,
    error: '无法在浏览器直接解析短链。请确认 PocketBase 已部署 pb_hooks 后重试，或改贴含坐标的长链接',
  };
}

export async function findNearbyPendingContributions(longitude: number, latitude: number): Promise<PendingContributionPreview[]> {
  if (!pocketbase || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
  const dLat = 50 / 110_540;
  const scale = Math.cos(latitude * Math.PI / 180) || 1;
  const dLng = 50 / (111_320 * scale);
  try {
    const result = await pocketbase.collection('contributions').getList({
      filter: `status = 'pending_review' && kind = 'new_statue' && longitude >= ${longitude - dLng} && longitude <= ${longitude + dLng} && latitude >= ${latitude - dLat} && latitude <= ${latitude + dLat}`,
      sort: '-created',
      perPage: 20,
    });
    return result.items
      .map((item) => {
        const itemLng = Number(item.longitude);
        const itemLat = Number(item.latitude);
        return {
          id: item.id,
          payload: recordToPayload(item),
          distance_m: distanceMeters(longitude, latitude, itemLng, itemLat),
          created_at: String(item.created ?? ''),
        };
      })
      .filter((item) => item.distance_m <= 50)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function assertDailyLimits(userId: string) {
  if (!pocketbase) throw new Error('尚未配置 PocketBase');
  const result = await pocketbase.collection('contributions').getList({
    filter: `user = '${userId}' && created >= '${startOfTodayIso()}'`,
    perPage: 20,
  });
  if (result.totalItems >= 5) throw new Error('今日提交次数已达上限');
  const withPhoto = result.items.filter((item) => item.photo || item.image_url).length;
  return withPhoto;
}

async function assertNoDuplicate(longitude: number, latitude: number) {
  if (!pocketbase) return;
  const dLat = 50 / 110_540;
  const scale = Math.cos(latitude * Math.PI / 180) || 1;
  const dLng = 50 / (111_320 * scale);
  const filter = `status = 'approved' && longitude >= ${longitude - dLng} && longitude <= ${longitude + dLng} && latitude >= ${latitude - dLat} && latitude <= ${latitude + dLat}`;
  const statues = await pocketbase.collection('statues').getList({ filter, perPage: 5 });
  for (const item of statues.items) {
    const dist = distanceMeters(longitude, latitude, Number(item.longitude), Number(item.latitude));
    if (dist <= 50) throw new Error(`50米内已有点位：${String(item.name ?? '')}`);
  }
  const pending = await findNearbyPendingContributions(longitude, latitude);
  if (pending[0]) throw new Error(`50米内已有待审核投稿：${pending[0].payload.name || '未命名点位'}`);
}

export async function submitContribution(input: ContributionInput, userId: string): Promise<string | null> {
  if (!pocketbase) return '尚未配置 PocketBase';
  try {
    if (!input.name.trim()) return '点位名称无效';
    if (input.name.trim().length > 80) return '点位名称过长';
    if (!input.province.trim() || !input.city.trim() || !input.address.trim()) return '请填写完整的省市区地址';
    const longitude = Number(input.longitude);
    const latitude = Number(input.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return '坐标无效';
    if (longitude < CHINA_BOUNDS.minLng || longitude > CHINA_BOUNDS.maxLng || latitude < CHINA_BOUNDS.minLat || latitude > CHINA_BOUNDS.maxLat) return '坐标超出中国范围';
    if (input.desc.length > 800 || input.background.length > 800) return '资料内容过长';

    const photosToday = await assertDailyLimits(userId);
    if (input.photo) {
      if (input.photo.size > 5 * 1024 * 1024) return '图片不能超过 5MB';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.photo.type)) return '仅支持 JPG、PNG、WebP';
      if (photosToday >= 5) return '今日上传图片次数已达上限';
    }

    const isNew = !input.existingId;
    if (isNew) {
      await assertNoDuplicate(longitude, latitude);
    } else {
      const pendingEdit = await pocketbase.collection('contributions').getList({
        filter: `status = 'pending_review' && kind = 'edit_suggestion' && external_id = '${(input.existingId ?? '').replace(/'/g, "\\'")}'`,
        perPage: 1,
      });
      if (pendingEdit.totalItems > 0) return '该点位已有待审核修改建议';
    }

    const form = new FormData();
    form.append('kind', isNew ? 'new_statue' : 'edit_suggestion');
    form.append('user', userId);
    if (input.existingDatabaseId) form.append('statue', input.existingDatabaseId);
    if (input.existingId) form.append('external_id', input.existingId);
    form.append('name', input.name.trim());
    form.append('province', input.province.trim());
    form.append('city', input.city.trim());
    form.append('address', input.address.trim());
    form.append('longitude', String(longitude));
    form.append('latitude', String(latitude));
    form.append('desc', input.desc);
    form.append('background', input.background);
    form.append('year', input.year);
    form.append('status', 'pending_review');
    form.append('payload', JSON.stringify({
      name: input.name.trim(),
      province: input.province.trim(),
      city: input.city.trim(),
      address: input.address.trim(),
      longitude,
      latitude,
      desc: input.desc,
      background: input.background,
      year: input.year,
      external_id: input.existingId ?? '',
    }));
    if (input.photo) form.append('photo', input.photo);

    await pocketbase.collection('contributions').create(form);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '提交失败';
  }
}

export async function loadApprovedStatues(): Promise<StatueFeature[]> {
  if (!pocketbase) return [];
  const [statues, approvedContribs] = await Promise.all([
    pocketbase.collection('statues').getList({ filter: "status = 'approved'", perPage: 500, sort: 'name' }),
    pocketbase.collection('contributions').getList({ filter: "status = 'approved'", perPage: 500 }).catch(() => ({ items: [] as PbRecord[], totalItems: 0 })),
  ]);

  const contributors = new Map<string, string[]>();
  for (const item of statues.items) {
    const names = item.contributor_names;
    if (Array.isArray(names) && names.length) {
      contributors.set(item.id, names.map(String));
    }
  }
  if (approvedContribs.items.length) {
    const userIds = approvedContribs.items.map((item) => String(item.user ?? '')).filter(Boolean);
    const users = await loadUserMap(userIds);
    for (const item of approvedContribs.items) {
      const statueId = String(item.statue ?? '');
      if (!statueId) continue;
      const name = displayName(users.get(String(item.user ?? '')));
      if (!name) continue;
      const list = contributors.get(statueId) ?? [];
      if (!list.includes(name)) list.push(name);
      contributors.set(statueId, list);
    }
  }

  return statues.items.map((item): StatueFeature => {
    const contributorsList = contributors.get(item.id) ?? [];
    const photo = photoUrl(item as PbRecord);
    const properties: StatueProperties = {
      id: String(item.external_id || item.id),
      databaseId: item.id,
      name: String(item.name ?? ''),
      province: String(item.province ?? ''),
      city: String(item.city ?? ''),
      address: String(item.address ?? ''),
      desc: item.desc ? String(item.desc) : undefined,
      background: item.background ? String(item.background) : undefined,
      year: item.year ? String(item.year) : undefined,
      image: photo || (item.image_url ? String(item.image_url) : undefined),
      source: item.source ? String(item.source) : undefined,
      verificationStatus: (item.verification_status ? String(item.verification_status) : 'verified') as StatueProperties['verificationStatus'],
      contributors: contributorsList,
    };
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(item.longitude), Number(item.latitude)] },
      properties,
    };
  });
}

export async function listMyContributions(userId: string): Promise<ContributionListItem[]> {
  if (!pocketbase) return [];
  const result = await pocketbase.collection('contributions').getList({
    filter: `user = '${userId}'`,
    sort: '-created',
    perPage: 200,
  });
  const self = pocketbase?.authStore.record as PbAuthRecord | null | undefined;
  const nameMap = new Map<string, PbAuthRecord>();
  if (self) nameMap.set(userId, self);
  return result.items.map((item) => mapContribution(item, nameMap));
}

export async function listAdminContributions(options: {
  status: 'pending' | 'reviewed';
  page: number;
  pageSize: number;
}): Promise<{ items: ContributionListItem[]; totalItems: number }> {
  if (!pocketbase) return { items: [], totalItems: 0 };
  const filter = options.status === 'pending' ? "status = 'pending_review'" : "status = 'approved' || status = 'rejected'";
  const result = await pocketbase.collection('contributions').getList({
    filter,
    sort: '-created',
    page: options.page,
    perPage: options.pageSize,
  });
  const users = await loadUserMap(result.items.flatMap((item) => [String(item.user ?? ''), String(item.reviewed_by ?? '')]));
  return {
    items: result.items.map((item) => mapContribution(item, users)),
    totalItems: result.totalItems,
  };
}

export async function reviewContribution(contributionId: string, nextStatus: 'approved' | 'rejected', comment: string, adminId: string): Promise<string | null> {
  if (!pocketbase) return '尚未配置 PocketBase';
  try {
    const item = await pocketbase.collection('contributions').getOne(contributionId);
    if (item.status !== 'pending_review') return '该投稿已审核';
    if (nextStatus !== 'approved' && nextStatus !== 'rejected') return '无效的审核状态';

    let statueId = item.statue ? String(item.statue) : '';
    if (nextStatus === 'approved') {
      const payload = recordToPayload(item);
      const image = photoUrl(item);
      const shared = {
        name: String(item.name ?? payload.name ?? ''),
        province: String(item.province ?? payload.province ?? ''),
        city: String(item.city ?? payload.city ?? ''),
        address: String(item.address ?? payload.address ?? ''),
        longitude: Number(item.longitude),
        latitude: Number(item.latitude),
        desc: item.desc ? String(item.desc) : payload.desc ?? '',
        background: item.background ? String(item.background) : payload.background ?? '',
        year: item.year ? String(item.year) : payload.year ?? '',
        image_url: image || (item.image_url ? String(item.image_url) : ''),
        verification_status: 'verified',
      };

      const submitter = await pocketbase.collection('users').getOne(String(item.user)).catch(() => null);
      const submitterName = displayName(submitter);
      const contributorNames = submitterName ? [submitterName] : [];

      if (item.kind === 'new_statue') {
        const created = await pocketbase.collection('statues').create({
          ...shared,
          status: 'approved',
          source: '用户贡献',
          created_by: item.user,
          contributor_names: contributorNames,
        });
        statueId = created.id;
      } else if (statueId && pocketbase) {
        const existing = await pocketbase.collection('statues').getOne(statueId).catch(() => null);
        const names = Array.isArray(existing?.contributor_names) ? (existing!.contributor_names as string[]).map(String) : [];
        if (submitterName && !names.includes(submitterName)) names.push(submitterName);
        await pocketbase.collection('statues').update(statueId, {
          ...shared,
          contributor_names: names,
        });
      } else {
        const externalId = String(item.external_id ?? payload.external_id ?? '');
        if (!externalId) return '缺少原点位标识';
        const existing = await pocketbase.collection('statues').getFirstListItem({ filter: `external_id = '${externalId.replace(/'/g, "\\'")}'` }).catch(() => null);
        const names = existing && Array.isArray(existing.contributor_names) ? (existing.contributor_names as string[]).map(String) : [];
        if (submitterName && !names.includes(submitterName)) names.push(submitterName);
        if (existing) {
          await pocketbase.collection('statues').update(existing.id, {
            ...shared,
            external_id: externalId,
            contributor_names: names,
            verification_status: 'verified',
          });
          statueId = existing.id;
        } else {
          const created = await pocketbase.collection('statues').create({
            ...shared,
            external_id: externalId,
            source: '用户修改建议',
            created_by: item.user,
            contributor_names: names,
          });
          statueId = created.id;
        }
      }
    }

    await pocketbase.collection('contributions').update(contributionId, {
      status: nextStatus,
      review_comment: comment,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      ...(statueId ? { statue: statueId } : {}),
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '审核失败';
  }
}

export interface AdminUserItem {
  id: string;
  email: string | null;
  username: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

export async function listAdminUsers(query: string): Promise<AdminUserItem[]> {
  if (!pocketbase) return [];
  const filter = query.trim()
    ? `email ~ '${query.trim().replace(/'/g, "\\'")}' || username ~ '${query.trim().replace(/'/g, "\\'")}'`
    : '';
  const result = await pocketbase.collection('users').getList({
    filter: filter || undefined,
    sort: '-created',
    perPage: 100,
  });
  return result.items.map((item) => ({
    id: item.id,
    email: item.email ? String(item.email) : null,
    username: item.username ? String(item.username) : null,
    role: item.role === 'admin' ? 'admin' : 'user',
    created_at: String(item.created ?? ''),
  }));
}

export async function adminResetUserPassword(userId: string): Promise<string | null> {
  if (!pocketbase) return '尚未配置 PocketBase';
  try {
    await pocketbase.collection('users').update(userId, {
      password: 'mao123456',
      passwordConfirm: 'mao123456',
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '重置失败';
  }
}

export async function updateMyUsername(username: string): Promise<string | null> {
  if (!pocketbase) return '尚未配置 PocketBase';
  const id = pocketbase.authStore.record?.id;
  if (!id) return '请先登录';
  const normalized = username.trim();
  if (normalized.length < 2 || normalized.length > 24) return '用户名需要 2 至 24 个字符';
  try {
    await pocketbase.collection('users').update(id, { username: normalized });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '用户名修改失败';
  }
}

export async function updateMyPassword(password: string): Promise<string | null> {
  if (!pocketbase) return '尚未配置 PocketBase';
  const id = pocketbase.authStore.record?.id;
  if (!id) return '请先登录';
  if (password.length < 6) return '密码至少需要 6 位';
  try {
    await pocketbase.collection('users').update(id, {
      password,
      passwordConfirm: password,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '密码修改失败';
  }
}
