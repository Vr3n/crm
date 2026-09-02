import type { LicenseStatus, LicenseSupportInfo } from './types'

/** Window.api.license.* calls — typed facade over the preload bridge. */
export const api = {
  status: (): Promise<LicenseStatus> => window.api.license.status(),
  activate: (licenseContent: string): Promise<LicenseStatus> =>
    window.api.license.activate({ licenseContent }),
  supportInfo: (): Promise<LicenseSupportInfo> => window.api.license.supportInfo()
}
