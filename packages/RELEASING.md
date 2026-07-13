# Releasing the Postpin SDKs

How to cut and publish a new version of any of the four official SDKs. **You only ever work in this monorepo** (`its-pradeependra/PostPin`) — publishing is automated by pushing a git **tag**.

> Shell note: these examples are for **PowerShell** on Windows. PowerShell does **not** support `&&` — run each line separately (as shown).

---

## The four SDKs at a glance

| SDK | Package | Folder | Registry | Publishes when you push tag |
|---|---|---|---|---|
| Node | `@postpin/node` | `packages/postpin-node` | [npm](https://www.npmjs.com/package/@postpin/node) | `postpin-node/vX.Y.Z` |
| Python | `postpin` | `packages/postpin-python` | [PyPI](https://pypi.org/project/postpin/) | `postpin-python/vX.Y.Z` |
| Go | `github.com/its-pradeependra/postpin-go` | `packages/postpin-go` | Go proxy / [pkg.go.dev](https://pkg.go.dev/github.com/its-pradeependra/postpin-go) | `postpin-go/vX.Y.Z` |
| PHP | `its-pradeependra/postpin-php` | `packages/postpin-php` | [Packagist](https://packagist.org/packages/its-pradeependra/postpin-php) | `postpin-php/vX.Y.Z` |

All versions follow **semver** `MAJOR.MINOR.PATCH`:
- **PATCH** (`0.1.0 → 0.1.1`) — bug fixes, no API change.
- **MINOR** (`0.1.0 → 0.2.0`) — new features, backward compatible.
- **MAJOR** (`0.9.0 → 1.0.0`) — breaking changes.

> ⚠️ A published version is **immutable** everywhere. You can never overwrite `0.1.0` — you can only publish a new number. If a release is broken, publish a fix as the next patch.

---

## Before every release: bump the version number

Each SDK stores its version in **one or two files** that must match the tag. Bump these **first**, commit, then tag.

| SDK | Files to edit | Field |
|---|---|---|
| Node | `packages/postpin-node/package.json` **and** `packages/postpin-node/src/version.ts` | `"version"` / `export const VERSION` |
| Python | `packages/postpin-python/pyproject.toml` **and** `packages/postpin-python/src/postpin/_version.py` | `version = ` / `__version__ = ` |
| Go | `packages/postpin-go/version.go` | `const Version` |
| PHP | `packages/postpin-php/src/Postpin.php` | `const VERSION` |

Also add a line to that SDK's `CHANGELOG.md` describing what changed.

> Keep **both** files in sync where there are two (the second one drives the `User-Agent` header). The git tag is what actually determines the published version for Go/PHP, but the in-code version should always match it.

---

## Release steps

### Node → npm

```powershell
# 1. bump version in package.json + src/version.ts, update CHANGELOG.md, then:
& 'd:\Shipping Calculator\gitpush.bat'        # commit + push main
# 2. tag and push (example for 0.1.1):
git tag postpin-node/v0.1.1
git push origin postpin-node/v0.1.1
```
→ Triggers **`publish-node.yml`**: builds and publishes to npm tokenlessly (OIDC trusted publishing + provenance).

### Python → PyPI

```powershell
# 1. bump version in pyproject.toml + src/postpin/_version.py, update CHANGELOG.md, then:
& 'd:\Shipping Calculator\gitpush.bat'
# 2. tag and push:
git tag postpin-python/v0.1.1
git push origin postpin-python/v0.1.1
```
→ Triggers **`publish-python.yml`**: builds and publishes to PyPI tokenlessly (OIDC). Also mirrors the code to `its-pradeependra/postpin-python`.

### Go → Go proxy

```powershell
# 1. bump const Version in packages/postpin-go/version.go, update CHANGELOG.md, then:
& 'd:\Shipping Calculator\gitpush.bat'
# 2. tag and push:
git tag postpin-go/v0.1.1
git push origin postpin-go/v0.1.1
```
→ Triggers **`split-sdks.yml`**: pushes the code + a clean `v0.1.1` tag to the `postpin-go` mirror. Consumers get it via `go get github.com/its-pradeependra/postpin-go@v0.1.1` (first fetch warms the proxy).

### PHP → Packagist

```powershell
# 1. bump const VERSION in packages/postpin-php/src/Postpin.php, update CHANGELOG.md, then:
& 'd:\Shipping Calculator\gitpush.bat'
# 2. tag and push:
git tag postpin-php/v0.1.1
git push origin postpin-php/v0.1.1
```
→ Triggers **`split-sdks.yml`**: pushes the code + `v0.1.1` tag to the `postpin-php` mirror. Packagist auto-publishes the new version via its GitHub App.

---

## Verify a release

| SDK | Check |
|---|---|
| Node | `npm view @postpin/node version` |
| Python | `pip install --no-cache-dir postpin` then `python -c "import postpin; print(postpin.__version__)"` |
| Go | `go get github.com/its-pradeependra/postpin-go@v0.1.1` |
| PHP | `composer require its-pradeependra/postpin-php:^0.1.1` |

You can also watch each run under the repo's **Actions** tab (`Publish Node SDK`, `Publish Python SDK`, `Split SDK repos`).

---

## One-time setup (already done — for reference)

- **Secret `SPLIT_TOKEN`** — fine-grained PAT with Contents: read+write on `postpin-go`, `postpin-php`, `postpin-python`. Used by `split-sdks.yml` to push the mirrors.
- **PyPI Trusted Publisher** — project `postpin`, repo `PostPin`, workflow `publish-python.yml`, environment `pypi`.
- **npm Trusted Publisher** — package `@postpin/node`, repo `PostPin`, workflow `publish-node.yml`.
- **Packagist GitHub App** — installed on the `postpin-php` mirror for auto-publish.
- **Mirror repos** (public, read-only, auto-synced): `postpin-go`, `postpin-php`, `postpin-python`. Never commit to these directly.

Workflows live in `.github/workflows/`: `publish-node.yml`, `publish-python.yml`, `split-sdks.yml`.

---

## Troubleshooting

- **"version already exists" / 403 on publish** — you reused a published number. Bump to the next patch and re-tag.
- **Tag pushed but nothing published** — the tag must point at a commit that contains the workflow. Push `main` first (`gitpush.bat`), then tag. Check the **Actions** tab for a failed/again-runnable run.
- **Deleted/wrong tag** — remove it and re-create:
  ```powershell
  git tag -d postpin-node/v0.1.1
  git push origin :refs/tags/postpin-node/v0.1.1
  ```
- **npm manual fallback** (if you ever need to publish Node by hand):
  ```powershell
  npm login
  cd 'd:\Shipping Calculator\packages\postpin-node'
  npm publish --access public
  ```
- **PyPI/Packagist page shows old README** — registries snapshot the README at publish time; it updates on the next version.
