/** Shared IPC contract. Dependency-free (no Electron/Node imports) — imported by main, preload and renderer. */

export type ApiError = {
  code: string; // e.g. 'VALIDATION', 'UNAUTHORIZED', 'NOT_FOUND', 'OVERPAYMENT', 'INTERNAL'
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export interface DbHealth {
  ok: boolean;
  migrations: number;
  dbFile: string;
}

export const CH = {
  app: { dbHealth: "app:dbHealth" },
} as const;
