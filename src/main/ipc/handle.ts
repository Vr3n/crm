import { ipcMain } from 'electron'

type IpcResult<T> = { ok: true; data: T } | { ok: false; message: string }

/**
 * Wraps an `ipcMain.handle` handler so that thrown errors never cross the IPC
 * boundary through Electron's default serialization (which would surface the
 * channel name and internal error class, e.g.
 * `Error invoking remote method 'identity:login': DomainError: ...`).
 *
 * Instead, every handler returns a discriminated result: `{ ok: true, data }`
 * on success, or `{ ok: false, message }` with a plain, user-facing message on
 * failure. The preload layer unwraps this and re-throws a clean `Error`.
 */
export function handle<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcResult<R>> => {
    try {
      const data = await fn(...(args as T))
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error. Please try again.'
      return { ok: false, message }
    }
  })
}
