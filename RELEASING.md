# Release process

This is a monorepo with 2 packages (`@nike-release-checker/sdk` and `@nike-release-checker/cli`) using [Changesets](https://github.com/changesets/changesets) for versioning. Releases only happen from the `master` branch.

## Step-by-step

### 1. Add a changeset (during development)

```bash
npm run changeset
```

Interactive prompt asks you to:

- Pick which packages changed (`sdk`, `cli`, or both)
- Pick semver bump type (`patch` / `minor` / `major`)
- Write a summary of the change

This creates a markdown file in `.changeset/` describing the change. Commit it with your code.

### 2. Merge to `master`

When your branch (e.g. `ts-migration`) is merged to `master`, the **Changesets Release PR** workflow (`changesets-release-pr.yml`) runs automatically. It:

- Detects pending changeset files in `.changeset/`
- Opens (or updates) a **"chore: release"** PR that bumps versions in `package.json` files and updates `CHANGELOG.md`

### 3. Merge the release PR

When you merge this release PR into `master`, the workflow runs again. This time there are no pending changesets, so `changesets/action` runs `changeset:version` and `changeset:publish`:

- `changeset:version` = `changeset version && npm i` — bumps versions, updates lockfile
- `changeset:publish` = `changeset tag && git push origin --tags` — creates git tags like `@nike-release-checker/sdk@0.3.0`

> Since `access: "restricted"` and there is no npm publish step, this repo doesn't publish to npm. It only creates git tags.

### 4. Artifact releases (triggered by tags)

When a tag is pushed and a GitHub Release is created, two workflows fire:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `sdk-tarball-release.yml` | `release: published` for `@nike-release-checker/sdk@*` tags | Runs `npm pack` on the SDK and attaches the `.tgz` tarball to the GitHub Release |
| `cli-sea-release.yml` | `release: published` for `@nike-release-checker/cli@*` tags | Builds SEA (Single Executable Application) binaries for macOS (arm64) and Windows (x64), attaches them to the GitHub Release |

Both workflows validate the tag prefix (`@nike-release-checker/<package>@`) via the `ensure-release-package` composite action and skip if the tag doesn't match their package.

## Local-only commands (manual fallback)

When you need to release without CI (or CI is not available for your branch):

```bash
# 1. Create a changeset (describe what changed)
npm run changeset

# 2. Apply version bumps (updates package.json versions, CHANGELOG.md, removes consumed changesets, runs npm i)
npm run changeset:version

# 3. Create git tags and push them
npm run changeset:publish
```

After step 3, tags like `@nike-release-checker/sdk@0.3.1` exist on the remote, but the artifact workflows (`sdk-tarball-release.yml`, `cli-sea-release.yml`) only trigger on `release: published` events — **not** on tag push alone. So you need one more step:

```bash
# 4. Create a GitHub Release from the tag (this triggers artifact workflows)
gh release create "@nike-release-checker/sdk@0.3.1" --title "@nike-release-checker/sdk@0.3.1" --generate-notes
```

Or if you just want the tags without GitHub Releases / artifacts, step 3 is enough.

> **Note on `ts-migration` branch:** Since `baseBranch` in `.changeset/config.json` is `master`, changesets are designed to flow through `master`. If you want to release from `ts-migration` directly, use these local commands — the CI workflow won't run on that branch.

## Summary flow

```
feature branch: npm run changeset -> commit .changeset/*.md
         |
merge to master -> CI opens "chore: release" PR (version bumps)
         |
merge release PR -> CI creates git tags -> GitHub Release triggers
         |
         |-- sdk tag -> attach SDK tarball
         +-- cli tag -> build & attach SEA binaries
```
