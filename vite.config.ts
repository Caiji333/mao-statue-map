import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function extractLocation(raw: string): { longitude: number; latitude: number; name: string } | null {
  const text = String(raw || '');
  const inChina = (lng: number, lat: number) =>
    Number.isFinite(lng) && Number.isFinite(lat) && lng >= 73 && lng <= 136 && lat >= 3 && lat <= 54;

  const decode = (value: string) => {
    try {
      return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
    } catch {
      return String(value || '');
    }
  };

  const parseQuery = (input: string) => {
    const qIndex = input.indexOf('?');
    const hashIndex = input.indexOf('#');
    let qs = '';
    if (qIndex >= 0) {
      qs = input.slice(qIndex + 1);
      if (hashIndex > qIndex) qs = qs.slice(0, hashIndex - qIndex - 1);
    } else if (hashIndex >= 0) {
      qs = input.slice(hashIndex + 1);
    }
    const out: Record<string, string> = {};
    for (const pair of qs.split('&')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      out[decode(pair.slice(0, eq))] = decode(pair.slice(eq + 1));
    }
    return out;
  };

  const query = parseQuery(text);
  if (query.q) {
    const parts = String(query.q).split(',');
    if (parts.length >= 2) {
      const lat = Number(parts[0]);
      const lng = Number(parts[1]);
      if (inChina(lng, lat)) return { longitude: lng, latitude: lat, name: parts.slice(2).join(',').trim() };
    }
  }
  if (query.position) {
    const parts = String(query.position).split(',');
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (inChina(lng, lat)) return { longitude: lng, latitude: lat, name: query.name || '' };
  }
  const lat = Number(query.lat ?? query.latitude);
  const lng = Number(query.lon ?? query.lng ?? query.longitude);
  if (inChina(lng, lat)) return { longitude: lng, latitude: lat, name: query.poiname || query.name || '' };

  const mQ = text.match(/q=([\d.]+)%2C([\d.]+)/i) || text.match(/q=([\d.]+),([\d.]+)/i);
  if (mQ) {
    const lat2 = Number(mQ[1]);
    const lng2 = Number(mQ[2]);
    if (inChina(lng2, lat2)) return { longitude: lng2, latitude: lat2, name: '' };
  }
  const mPos = text.match(/position=([\d.]+),([\d.]+)/i);
  if (mPos) {
    const lng2 = Number(mPos[1]);
    const lat2 = Number(mPos[2]);
    if (inChina(lng2, lat2)) return { longitude: lng2, latitude: lat2, name: '' };
  }
  const mLat = text.match(/lat=([\d.]+)/i);
  const mLon = text.match(/lon=([\d.]+)/i) || text.match(/lng=([\d.]+)/i);
  if (mLat && mLon) {
    const lat2 = Number(mLat[1]);
    const lng2 = Number(mLon[1]);
    if (inChina(lng2, lat2)) return { longitude: lng2, latitude: lat2, name: '' };
  }
  return null;
}

async function resolveAmapShare(input: string) {
  const early = extractLocation(input);
  if (early) return early;

  const match = String(input).match(
    /https:\/\/(?:surl\.amap\.com|wb\.amap\.com|m\.amap\.com|uri\.amap\.com|www\.amap\.com|amap\.com)\/[^\s<>\]）)，。]+/i,
  );
  if (!match) return null;

  let current = match[0].replace(/^http:\/\//i, 'https://');
  for (let i = 0; i < 6; i += 1) {
    const hit = extractLocation(current);
    if (hit) return hit;

    // redirect:manual — 读 Location，避免自动跟到底丢坐标
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const location = response.headers.get('location') || response.headers.get('Location') || '';
    const locHit = extractLocation(location);
    if (locHit) return locHit;

    const body = await response.text();
    const bodyHit = extractLocation(body);
    if (bodyHit) return bodyHit;

    if (location) {
      current = new URL(location, current).toString().replace(/^http:\/\//i, 'https://');
      continue;
    }
    break;
  }
  return null;
}

function readJsonBody(req: { on: (event: string, cb: (chunk?: unknown) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk?: unknown) => {
      raw += typeof chunk === 'string' ? chunk : String(chunk ?? '');
    });
    req.on('end', () => resolve(raw));
    req.on('error', () => reject(new Error('read body failed')));
  });
}

function amapSharePlugin(): Plugin {
  const handler = async (
    req: { method?: string; on: (event: string, cb: (chunk?: unknown) => void) => void },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void },
  ) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    try {
      const raw = await readJsonBody(req);
      const payload = JSON.parse(raw || '{}') as { url?: string; text?: string };
      const input = String(payload.url || payload.text || '');
      const hit = await resolveAmapShare(input);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (hit) {
        res.statusCode = 200;
        res.end(JSON.stringify(hit));
      } else {
        res.statusCode = 422;
        res.end(JSON.stringify({ error: '该分享链接中未找到有效坐标' }));
      }
    } catch (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'resolve failed' }));
    }
  };

  return {
    name: 'amap-share-resolver',
    configureServer(server) {
      server.middlewares.use('/api/resolve-amap-share', handler as never);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/resolve-amap-share', handler as never);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), amapSharePlugin()],
  build: {
    chunkSizeWarningLimit: 1_300,
  },
});
