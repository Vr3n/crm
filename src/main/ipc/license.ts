import { app } from 'electron'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { activateLicenseInputSchema } from '../../shared/contracts/license'
import { getLicenseStatus, refreshLicenseStatus } from '../licensing/state'
import { writeLicenseFile } from '../licensing/licenseFile'
import { collectFingerprint } from '../licensing/fingerprint'
import { handle } from './handle'

export function registerLicenseIpc(): void {
  handle(IPC_CHANNELS.LICENSE_STATUS, () => getLicenseStatus())

  handle(
    IPC_CHANNELS.LICENSE_ACTIVATE,
    activateLicenseInputSchema,
    ({ licenseContent }) => {
      writeLicenseFile(app.getPath('userData'), licenseContent)
      return refreshLicenseStatus()
    }
  )

  handle(IPC_CHANNELS.LICENSE_SUPPORT_INFO, () => {
    const status = getLicenseStatus()
    const fp = collectFingerprint()
    return {
      organization: status.organization ?? null,
      fingerprint: fp
    }
  })
}
