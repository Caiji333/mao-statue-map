const allowedHosts = new Set(['surl.amap.com', 'wb.amap.com', 'uri.amap.com', 'www.amap.com', 'amap.com']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}

function extractLocation(url: URL) {
  const query = url.searchParams.get('q');
  if (query) {
    const [latitudeText, longitudeText, ...nameParts] = query.split(',');
    const latitude = Number(latitudeText); const longitude = Number(longitudeText);
    if (Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= 73 && longitude <= 136 && latitude >= 3 && latitude <= 54) {
      return { longitude, latitude, name: nameParts.join(',').trim() };
    }
  }
  const position = url.searchParams.get('position');
  if (position) {
    const [longitudeText, latitudeText] = position.split(',');
    const longitude = Number(longitudeText); const latitude = Number(latitudeText);
    if (Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= 73 && longitude <= 136 && latitude >= 3 && latitude <= 54) return { longitude, latitude, name: '' };
  }
  return null;
}

function extractAmapUrl(input: unknown) {
  const text = String(input ?? '').trim();
  const match = text.match(/https:\/\/(?:surl\.amap\.com|wb\.amap\.com|uri\.amap\.com|www\.amap\.com|amap\.com)\/[^\s<>\]）)，。]+/i);
  if (!match) throw new Error('invalid amap url');
  return new URL(match[0]);
}

async function fetchRedirect(url: URL) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  if (response.status !== 405 && response.status !== 501) return response;
  return fetch(url, { method: 'GET', redirect: 'manual' });
}

async function isAuthenticated(request: Request) {
  const authorization = request.headers.get('authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization },
  });
  return response.ok;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await isAuthenticated(request))) return json({ error: '请先登录后再解析高德分享链接' }, 401);

  try {
    const { url: input } = await request.json();
    let current = extractAmapUrl(input);
    for (let redirects = 0; redirects <= 4; redirects += 1) {
      if (current.protocol !== 'https:' || !allowedHosts.has(current.hostname.toLowerCase())) return json({ error: '仅支持高德地图官方分享链接' }, 400);
      const location = extractLocation(current);
      if (location) return json(location);
      const response = await fetchRedirect(current);
      const redirect = response.headers.get('location');
      if (!redirect) break;
      current = new URL(redirect, current);
      if (current.protocol === 'http:') current.protocol = 'https:';
    }
    return json({ error: '该分享链接中未找到有效坐标' }, 422);
  } catch {
    return json({ error: '高德分享链接格式不正确' }, 400);
  }
});
