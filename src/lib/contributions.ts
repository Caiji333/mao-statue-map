import { supabase } from './supabase';
import type { ContributionInput } from '../components/ContributionDialog';
import type { StatueFeature, StatueProperties } from '../types/statue';

export interface PendingContributionPreview { id: string; payload: Record<string, string>; distance_m: number; created_at: string; }
export interface AmapShareLocation { longitude: number; latitude: number; name: string; }

export async function resolveAmapShareUrl(url: string): Promise<{ data: AmapShareLocation | null; error: string | null }> {
  if (!supabase) return { data: null, error: '尚未配置 Supabase' };
  const { data, error } = await supabase.functions.invoke('resolve-amap-share', { body: { url } });
  if (error) return { data: null, error: '高德链接解析失败，请检查链接后重试' };
  if (data?.error) return { data: null, error: String(data.error) };
  return { data: data as AmapShareLocation, error: null };
}

export async function findNearbyPendingContributions(longitude: number, latitude: number): Promise<PendingContributionPreview[]> {
  if (!supabase || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
  const { data } = await supabase.rpc('nearby_pending_contributions', { p_lng: longitude, p_lat: latitude, p_radius_m: 50 });
  return (data ?? []) as PendingContributionPreview[];
}

export async function submitContribution(input: ContributionInput, userId: string): Promise<string | null> {
  if (!supabase) return '尚未配置 Supabase';
  let imageUrl = '';
  if (input.photo) {
    if (input.photo.size > 5 * 1024 * 1024) return '图片不能超过 5MB';
    const extension = input.photo.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('contribution-photos').upload(path, input.photo);
    if (error) return error.message;
    imageUrl = supabase.storage.from('contribution-photos').getPublicUrl(path).data.publicUrl;
  }
  const payload = { ...input, photo: undefined, existingDatabaseId: undefined, external_id: input.existingId, image_url: imageUrl || undefined };
  const { error } = await supabase.rpc('submit_contribution', { p_kind: input.existingId ? 'edit_suggestion' : 'new_statue', p_statue_id: input.existingDatabaseId ?? null, p_payload: payload });
  if (error && imageUrl) {
    const path = imageUrl.split('/contribution-photos/')[1];
    if (path) await supabase.storage.from('contribution-photos').remove([path]);
  }
  return error?.message ?? null;
}

export async function loadApprovedStatues(): Promise<StatueFeature[]> {
  if (!supabase) return [];
  const [{ data, error }, { data: contributorRows }] = await Promise.all([
    supabase.from('statues').select('id,external_id,name,province,city,address,longitude,latitude,desc,background,year,image_url,source,verification_status').eq('status', 'approved'),
    supabase.rpc('public_statue_contributors'),
  ]);
  if (error) throw error;
  const contributors = new Map<string, string[]>((contributorRows ?? []).map((row: { statue_id: string; contributor_names: string[] }) => [row.statue_id, row.contributor_names]));
  return (data ?? []).map((item) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [item.longitude, item.latitude] },
    properties: { id: item.external_id ?? item.id, databaseId: item.id, name: item.name, province: item.province, city: item.city, address: item.address, desc: item.desc ?? undefined, background: item.background ?? undefined, year: item.year ?? undefined, image: item.image_url ?? undefined, source: item.source ?? undefined, verificationStatus: (item.verification_status ?? 'verified') as StatueProperties['verificationStatus'], contributors: contributors.get(item.id) ?? [] },
  }));
}
