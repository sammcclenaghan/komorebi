import type { KomorebiApi } from "../preload/preload";

declare global {
  interface Window {
    komorebi: KomorebiApi;
  }
}
