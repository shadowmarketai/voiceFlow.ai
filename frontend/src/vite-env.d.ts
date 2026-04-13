/// <reference types="vite/client" />

/**
 * Type declarations for Vite environment variables.
 * These match the .env / .env.example configuration.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
