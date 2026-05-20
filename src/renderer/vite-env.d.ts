import type { GoalpathApi } from "../preload/preload";

declare global {
  interface Window {
    goalpath: GoalpathApi;
  }
}
