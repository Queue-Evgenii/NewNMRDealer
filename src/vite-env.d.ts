/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:app-version' {
  /** Версия этой сборки — из package.json, см. vite.config.ts. */
  export const APP_VERSION: string
}

interface ImportMetaEnv {
  /** Откуда спрашивать версию, если она лежит не рядом со сборкой. */
  readonly VITE_VERSION_URL?: string
}
