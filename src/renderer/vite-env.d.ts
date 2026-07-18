/// <reference types="vite/client" />

import type { KomorebiApi } from "~/shared/api";

interface ImportMetaEnv {
  readonly VITE_KOMOREBI_WEB: string;
  readonly VITE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    komorebi: KomorebiApi;
  }
}
