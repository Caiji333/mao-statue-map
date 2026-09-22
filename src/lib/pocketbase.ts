export interface PbRecord {
  id: string;
  [key: string]: unknown;
}

export interface PbAuthRecord extends PbRecord {
  email?: string;
  username?: string;
  role?: 'user' | 'admin';
  name?: string;
  verified?: boolean;
  emailVisibility?: boolean;
  created?: string;
  updated?: string;
}

interface AuthStore {
  token: string;
  record: PbAuthRecord;
}

const STORAGE_KEY = 'pocketbase_auth';

function readStore(): AuthStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthStore;
    if (!parsed?.token || !parsed?.record?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(value: AuthStore | null) {
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  else localStorage.removeItem(STORAGE_KEY);
}

export class PocketBaseClient {
  readonly baseUrl: string;
  private store: AuthStore | null = readStore();
  private listeners = new Set<(record: PbAuthRecord | null) => void>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  get authStore() {
    return {
      get token() {
        return readStore()?.token ?? '';
      },
      get record(): PbAuthRecord | null {
        return readStore()?.record ?? null;
      },
      get isValid() {
        return Boolean(readStore()?.token);
      },
      clear: () => this.clearAuth(),
      onChange: (callback: (record: PbAuthRecord | null) => void) => {
        this.listeners.add(callback);
        return () => {
          this.listeners.delete(callback);
        };
      },
    };
  }

  private emit() {
    const record = this.store?.record ?? null;
    this.listeners.forEach((callback) => callback(record));
  }

  private setAuth(token: string, record: PbAuthRecord) {
    this.store = { token, record };
    writeStore(this.store);
    this.emit();
  }

  clearAuth() {
    this.store = null;
    writeStore(null);
    this.emit();
  }

  private async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/api${path}`);
    if (init.query) {
      Object.entries(init.query).forEach(([key, value]) => {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
      });
    }

    const headers = new Headers(init.headers);
    if (this.store?.token) headers.set('Authorization', this.store.token);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url.toString(), { ...init, headers });
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok) {
      const payload = data as { message?: string; data?: Record<string, { message?: string }> } | null;
      const fieldError = payload?.data ? Object.values(payload.data).map((item) => item?.message).filter(Boolean)[0] : '';
      throw new Error(payload?.message || fieldError || `HTTP ${response.status}`);
    }
    return data as T;
  }

  collection(name: string) {
    const client = this;
    return {
      async authWithPassword(identity: string, password: string) {
        const data = await client.request<{ token: string; record: PbAuthRecord }>(
          `/collections/${name}/auth-with-password`,
          { method: 'POST', body: JSON.stringify({ identity, password }) },
        );
        client.setAuth(data.token, data.record);
        return data;
      },
      async authRefresh() {
        const data = await client.request<{ token: string; record: PbAuthRecord }>(
          `/collections/${name}/auth-refresh`,
          { method: 'POST', body: JSON.stringify({}) },
        );
        client.setAuth(data.token, data.record);
        return data;
      },
      async create(body: FormData | Record<string, unknown>) {
        return client.request<PbRecord>(`/collections/${name}/records`, {
          method: 'POST',
          body: body instanceof FormData ? body : JSON.stringify(body),
        });
      },
      async update(id: string, body: FormData | Record<string, unknown>) {
        return client.request<PbRecord>(`/collections/${name}/records/${id}`, {
          method: 'PATCH',
          body: body instanceof FormData ? body : JSON.stringify(body),
        });
      },
      async getOne(id: string, query?: Record<string, string | number | undefined>) {
        return client.request<PbRecord>(`/collections/${name}/records/${id}`, { query });
      },
      async getList(query?: Record<string, string | number | undefined>) {
        return client.request<{ page: number; perPage: number; totalItems: number; items: PbRecord[] }>(
          `/collections/${name}/records`,
          { query },
        );
      },
      async getFirstListItem(query?: Record<string, string | number | undefined>) {
        const result = await this.getList({ perPage: 1, ...query });
        if (!result.items[0]) throw new Error('未找到匹配记录');
        return result.items[0];
      },
    };
  }

  files(collectionIdOrName: string, record: PbRecord, filename: string) {
    if (!filename) return '';
    return `${this.baseUrl}/api/files/${collectionIdOrName}/${record.id}/${encodeURIComponent(filename)}`;
  }

  async health() {
    return this.request<{ message?: string }>('/health');
  }
}

const url = import.meta.env.VITE_POCKETBASE_URL?.trim() ?? '';

export const pocketbase: PocketBaseClient | null = url ? new PocketBaseClient(url) : null;
export const hasPocketBase = pocketbase !== null;
