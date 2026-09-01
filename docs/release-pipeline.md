# Release Pipeline

CrownCRM uses [semantic-release](https://github.com/semantic-release/semantic-release) to automate versioning, tagging, changelog generation, and GitHub Release publishing on every push to `master`.

## How it works

1. Push to `master` triggers `.github/workflows/release.yml`.
2. `semantic-release` analyzes commits since the last tag using [Conventional Commits](https://www.conventionalcommits.org/).
3. Based on commit types, it determines the next version:
   - `feat:` → minor bump (`1.0.0` → `1.1.0`)
   - `fix:`, `perf:`, `refactor:` → patch bump (`1.0.0` → `1.0.1`)
   - `feat!:` or `BREAKING CHANGE:` footer → major bump (`1.0.0` → `2.0.0`)
   - `docs`, `chore`, `style`, `test`, `ci` → **no release**
4. Bumps `package.json` and `package-lock.json`, generates `CHANGELOG.md`.
5. Builds the Windows installer (`CrownCRM-setup.exe`) with `electron-builder`.
6. Creates a git tag (`v1.1.0`) and pushes it.
7. Creates a GitHub Release marked as pre-release and uploads the installer + `latest.yml`.
8. Commits `package.json`, `package-lock.json`, and `CHANGELOG.md` back to `master`.

## Commit message format

All commits **must** follow Conventional Commits:

```
feat: add customer search
fix: correct invoice calculation
feat!: redesign API response format
BREAKING CHANGE: old endpoints removed
chore: update dependencies
```

## Files touched by the pipeline

| File | Who modifies | When |
|---|---|---|
| `package.json` | semantic-release | Every release |
| `package-lock.json` | semantic-release | Every release |
| `CHANGELOG.md` | semantic-release | Every release |
| `dist/CrownCRM-setup.exe` | electron-builder | Every release (uploaded to GitHub) |
| `dist/latest.yml` | electron-builder | Every release (uploaded to GitHub) |

## Secrets required

- `GITHUB_TOKEN` — provided automatically by GitHub Actions. No manual configuration needed unless `master` is branch-protected (then use a PAT stored as `GH_TOKEN`).

## Local dry-run

To preview what `semantic-release` would do without publishing:

```bash
npx semantic-release --dry-run
```

## Pre-release marking

All releases are published as GitHub pre-releases. To release a stable version, edit the release on GitHub and uncheck "Set as a pre-release".
