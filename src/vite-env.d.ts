/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MAP_PROVIDER?: 'amap_legacy' | 'tianditu';
  readonly VITE_TIANDITU_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
