import type { MnApi } from "../../preload/index";

declare global {
  interface Window {
    mn: MnApi;
  }
}
export {};
