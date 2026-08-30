### Implementation instructions for the developer agent

Repository: `Vr3n/crm`
GitHub: `https://github.com/Vr3n/crm`

Modify the Electron Builder configuration in `electron-builder.yml`.

1. Set the permanent application identity:

```yaml
appId: com.crowncrm.app
productName: CrownCRM
```

Do not change `appId` again after this. `appId` is the stable application identity used by electron-builder/NSIS, while `productName` is the user-facing application name. Electron Builder recommends an explicit reverse-DNS-style `appId`. ([GitHub][1])

2. Configure Windows as an unsigned, per-user NSIS installation:

```yaml
win:
  verifyUpdateCodeSignature: false

nsis:
  oneClick: true
  perMachine: false
```

Do not add code-signing configuration yet. We are intentionally deferring Windows code signing.

`verifyUpdateCodeSignature: false` is required because the Windows installer will currently be unsigned. Electron Builder documents this option specifically for updates that are not Authenticode-signed. ([electron.build][2])

Keep `oneClick: true` and `perMachine: false`. Per-user NSIS installations can update without requiring elevation/UAC for the automatic update flow. ([GitHub][3])

3. Remove the old generic update publisher configuration:

```yaml
publish:
  provider: generic
  url: https://example.com/auto-updates
```

Replace it with the GitHub publisher:

```yaml
publish:
  provider: github
  owner: Vr3n
  repo: crm
```

Do not use `<your-org>` or `<your-repo>` placeholders. The actual values are:

```text
owner = Vr3n
repo  = crm
```

4. Do not unnecessarily set `executableName`.

Since `productName` is now `CrownCRM`, let electron-builder derive the executable name from it. The current electron-builder configuration documents `executableName` as defaulting to `productName`. ([electron.build][4])

Therefore, prefer:

```yaml
productName: CrownCRM
```

rather than adding:

```yaml
win:
  executableName: CrownCRM
```

unless the existing project has a specific reason to override the executable name.

5. Keep the existing file/package configuration intact.

Do not rewrite the existing `files`, `asarUnpack`, `directories`, macOS, Linux, or other unrelated configuration merely to implement this change.

The resulting relevant section should be equivalent to:

```yaml
appId: com.crowncrm.app
productName: CrownCRM

# existing directories/files/asar configuration remains unchanged

win:
  verifyUpdateCodeSignature: false

nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
  oneClick: true
  perMachine: false

# existing mac/linux configuration remains unchanged

publish:
  provider: github
  owner: Vr3n
  repo: crm
```

6. GitHub repository details:

```text
GitHub owner: Vr3n
GitHub repository: crm
Repository visibility: Public
Provider: github
```

Because the repository is public, don't add a `GH_TOKEN` requirement merely for the local configuration. For CI publishing, configure the workflow according to GitHub's release permissions/token requirements rather than hard-coding a token anywhere in the repository.

7. Important: don't implement automatic updating yet unless it already exists.

This task is specifically to configure electron-builder's identity, Windows installer behavior, and GitHub publishing.

After the configuration change, inspect the existing application code and determine whether `electron-updater` is already implemented. If it is not, report that separately rather than silently adding an updater implementation.

8. Validate the configuration.

After making the changes:

```text
- Validate electron-builder.yml syntax.
- Run the project's existing typecheck/lint checks if available.
- Run a Windows electron-builder build.
- Confirm the generated installer is an NSIS .exe.
- Confirm the application is named CrownCRM.
- Confirm the executable is CrownCRM.exe unless the existing project intentionally overrides it.
- Confirm the installer is per-user and one-click.
- Confirm no code-signing configuration was introduced.
- Confirm publish configuration resolves to GitHub owner Vr3n / repo crm.
```

Do not create a GitHub release or publish production artifacts unless explicitly requested.

The key values are therefore fixed:

```text
appId:       com.crowncrm.app
productName: CrownCRM

publish provider: github
publish owner:    Vr3n
publish repo:     crm

Windows:
verifyUpdateCodeSignature: false

NSIS:
oneClick:    true
perMachine:  false
```

The reason for treating `com.crowncrm.app` as permanent is not just convention: electron-builder derives the NSIS identity/GUID from the application identity, and its documentation warns against changing `appId` after the application is in use. ([GitHub][5])

[1]: https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/configuration.ts?utm_source=chatgpt.com 'electron-builder/packages/app-builder-lib/src/configuration.ts at master · electron-userland/electron-builder · GitHub'
[2]: https://www.electron.build/docs/win/?utm_source=chatgpt.com 'Windows | electron-builder'
[3]: https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/NsisUpdater.ts?utm_source=chatgpt.com 'electron-builder/packages/electron-updater/src/NsisUpdater.ts at master · electron-userland/electron-builder · GitHub'
[4]: https://www.electron.build/docs/configuration/?utm_source=chatgpt.com 'Configuration | electron-builder'
[5]: https://github.com/electron-userland/electron-builder/blob/master/website/docs/nsis.md?utm_source=chatgpt.com 'electron-builder/website/docs/nsis.md at master · electron-userland/electron-builder · GitHub'
