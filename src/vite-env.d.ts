/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // Optional: CARTO basemap tiles render with an "API key required"
  // watermark when unset, but the map still works. Unlike the Supabase
  // vars above, this is not required for the app to function.
  readonly VITE_CARTO_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
