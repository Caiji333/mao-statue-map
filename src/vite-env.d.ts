/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_PROVIDER?: 'amap_legacy' | 'tianditu';
  readonly VITE_TIANDITU_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
