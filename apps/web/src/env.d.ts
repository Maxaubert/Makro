/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** `fixture` loads scripts/out/products-fixture.sqlite through the dev server instead of the bucket. */
  readonly VITE_PRODUCTS_SOURCE?: 'bucket' | 'fixture';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
