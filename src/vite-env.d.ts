/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL?: string;
  readonly VITE_MAP_PROVIDER?: 'amap_legacy' | 'tianditu';
  readonly VITE_TIANDITU_TOKEN?: string;
  readonly VITE_AMAP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
