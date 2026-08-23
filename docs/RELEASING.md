# Releasing Realm Studio Plus

The runbook for cutting a release of this fork. Releases are published to [the releases of this repository](https://github.com/jooy2/realm-studio-plus/releases), which is also where the running app looks for updates - see [What the auto updater needs from a release](#what-the-auto-updater-needs-from-a-release).

Everything here is done by hand, on one machine per platform. The workflows under `.github/workflows` belong to the original project and cannot run here.

## The order at a glance

```
1. Prepare the version        package.json + package-lock.json + CHANGELOG.md, committed and pushed
2. Package, per platform      macOS -> npm run release:mac        (on the signing Mac)
                              Windows -> npm run package -- --win --x64 --arm64
                              Linux -> npm run package -- --linux --x64 --arm64
3. Verify                     npm run verify:mac, and check what landed in dist/
4. Upload                     one draft release, all platforms' installers *and* their latest*.yml
5. Publish                    undraft the release, then open the vNext section again
```

Steps 2 and 3 happen once per platform and are independent of each other; step 4 collects all of them into a single release. Nothing is published until every platform is in.

## Before you start

- Node as pinned in [`.nvmrc`](../.nvmrc) (`nvm use`) and a clean install with `npm ci`.
- macOS: a Developer ID Application certificate in the keychain and notarization credentials in `electron-builder.env`. Both are one-time setup, described in [MACOS-SIGNING.md](MACOS-SIGNING.md). Without them the build fails - `mac.forceCodeSigning` is deliberate.
- The [`gh`](https://cli.github.com) CLI, authenticated against this repository, for the upload step.
- A machine (or VM) per platform and architecture you intend to ship. The `realm.node` native binding is built for the target, so a Windows arm64 installer wants an arm64 Windows.

## 1. Prepare the version

1. Bump `version` in [`package.json`](../package.json).
2. Refresh the lockfile: `npm i --package-lock-only`.
3. In [CHANGELOG.md](../CHANGELOG.md), replace the `## vNext (TBD)` heading with `## <version> (<YYYY-MM-DD>)` and drop the `- None` placeholders from the sections that stayed empty.
4. Commit and push. The release tag is created from this commit, so it has to be on the default branch before step 4.

## 2. Package

`npm run package` runs `electron-builder --publish=never`, which never uploads anything on its own. In order, one run does:

1. `prepackage` - wipes `build/` and rebuilds the webpack bundles in production mode.
2. Rebuilds the native dependencies for the target, and packs the app into an unpacked directory in `dist/` - `dist/mac*/` on macOS, `dist/win-unpacked/` and `dist/linux-unpacked/` elsewhere, with an `-<arch>-` in the name for every architecture that is not the default one.
3. **macOS only:** signs the `.app` with the Developer ID certificate, submits it to Apple, and staples the ticket to the bundle.
4. Builds the installers for that platform from the packed app.
5. Writes the auto-update metadata - `latest*.yml` - and a `.blockmap` next to each installer it describes.

Because step 5 rewrites that platform's `latest*.yml` from scratch, **every architecture of a platform has to be built in a single run.** A second run for the other architecture leaves behind a metadata file that only mentions what the last run built, and the updater then offers that artifact to every machine.

### macOS

On the Mac holding the certificate:

```bash
npm ci
npm run release:mac
```

`release:mac` is three steps, in this order:

1. `npm run package` - as above. `mac.target` lists both architectures, so one run covers x64 and arm64.
2. `npm run notarize:dmg` - electron-builder notarizes the `.app` before the disk image exists, so each `.dmg` is submitted and stapled here.
3. `npm run verify:mac` - checks every `.app` and `.dmg` against Gatekeeper. Do not upload artifacts that fail it.

Stapling in step 2 rewrites the `.dmg`, so the checksum recorded for it in `latest-mac.yml` no longer matches the file. That is harmless and must not be "fixed" by re-running the packaging: on macOS the updater only ever downloads the `.zip`, and the `.dmg` entry is there for first-time downloads.

### Windows

```bash
npm ci
npm run package -- --win --x64 --arm64
```

Drop an architecture you are not shipping. `nsis` produces the installer the updater uses; `portable` produces a single self-contained `.exe` that cannot update itself.

### Linux

```bash
npm ci
npm run package -- --linux --x64 --arm64
```

## 3. Verify what landed in `dist/`

A release is only complete if the metadata file for the platform is there:

| Platform | Installers | Metadata |
| --- | --- | --- |
| macOS | `realm-studio-plus-<version>-<x64\|arm64>.dmg`, `realm-studio-plus-<version>-<x64\|arm64>.zip` | `latest-mac.yml` |
| Windows | `realm-studio-plus-<version>-<x64\|arm64>-setup.exe`, `realm-studio-plus-<version>-<x64\|arm64>-portable.exe` | `latest.yml` |
| Linux | `realm-studio-plus-<version>-<x64\|arm64>.AppImage`, `realm-studio-plus-<version>-<amd64\|arm64>.deb`, `realm-studio-plus-<version>-<x86_64\|aarch64>.rpm` | `latest-linux.yml` |

Plus the `.blockmap` files written next to the installers - they let the updater download only the parts of an installer that changed.

Open the `latest*.yml` and check that every `url:` in it names a file that is actually in `dist/`. That is exactly what the updater will ask GitHub for.

> `.deb` and `.rpm` are named after the packaging convention (`amd64`, `x86_64`) rather than after Node's architecture names, while the updater picks an artifact by looking for `x64` or `arm64` in the file name. If a release ever carries both architectures of those two formats, an x64 machine can be handed the arm64 package. Ship one architecture per format, or check the offer before publishing.

## 4. Upload

Everything goes into **one** release, as a draft, so that no half-finished release is ever the newest one.

```bash
node ./scripts/extract-changelog.mjs > ./RELEASENOTES.md
gh release create v20.2.0 --draft --title v20.2.0 --notes-file ./RELEASENOTES.md
```

Then, from each build machine, upload that platform's share:

```bash
# macOS
gh release upload v20.2.0 dist/latest-mac.yml dist/*.dmg dist/*.zip dist/*.blockmap
# Windows
gh release upload v20.2.0 dist/latest.yml dist/*.exe dist/*.blockmap
# Linux
gh release upload v20.2.0 dist/latest-linux.yml dist/*.AppImage dist/*.deb dist/*.rpm
```

Tag names may carry the `v` prefix or not - the updater reads both - but staying with `v<version>` keeps them consistent.

For Windows and Linux, electron-builder can upload on its own with a `GH_TOKEN` that has the `repo` scope, which also creates the draft release if it does not exist yet:

```bash
GH_TOKEN=… npx electron-builder --win --linux --x64 --arm64 --publish always
```

Do not do this for macOS. The disk images are stapled after electron-builder has already finished, so publishing from the same command uploads images without a notarization ticket.

## 5. Publish

1. Check the draft one last time: the three `latest*.yml` files, and an installer for every platform and architecture they mention.
2. Publish the release. GitHub excludes drafts and prereleases from `/releases/latest`, so this is the moment the update reaches everyone.
3. Put a fresh section back at the top of [CHANGELOG.md](../CHANGELOG.md):

   ```markdown
   ## vNext (TBD)

   ### Enhancements

   - None

   ### Fixed

   - None

   ### Internals

   - None
   ```

4. Install the published build once and let it check for updates, or run an older build against it, to confirm the release is actually offered.

## What the auto updater needs from a release

`build.publish` in [`package.json`](../package.json) names this repository, and electron-builder copies those coordinates into the `app-update.yml` that ships inside the package - the packaged app has no other source of update information.

electron-updater does not read the release page. It reads the `latest*.yml` from the assets of the newest published release, resolves the artifact for the running platform and architecture from it, and verifies the download against the checksum recorded there. A release carrying only installers is invisible to it, which is why step 4 uploads the metadata alongside them.

Not every artifact can be installed by the updater:

| Artifact | Update |
| --- | --- |
| `.zip` (macOS) | Installed. This is what the updater applies on macOS |
| `.dmg` (macOS) | First-time downloads only - electron-updater cannot install a `.dmg` |
| `-setup.exe` (NSIS) | Installed |
| `-portable.exe` | Not updatable - the portable build is a single file the user placed themselves |
| `.AppImage` | Installed |
| `.deb`, `.rpm` | Installed, after asking for a password |

When the metadata is missing, or the artifact for this platform cannot be installed, the app asks the GitHub releases API for the latest tag and offers to open the release page instead - see [`src/main/Updater.ts`](../src/main/Updater.ts). That path only notifies, it never installs, so it is a safety net and not a substitute for uploading the metadata.

Artifact names must not contain spaces, which is why `artifactName` has none. GitHub turns a space into a `.` when the file is uploaded through the web UI, electron-builder turns it into a `-` when it publishes, and the updater only resolves the second form - a name with spaces therefore works only when the release happens to have been uploaded by electron-builder itself.

## Rolling back a release

Edit the broken release on GitHub and save it back as a draft. `/releases/latest` then resolves to the previous release again, and both the updater and the release-page fallback follow it - the update metadata lives in the release itself, so unpublishing it retracts the update. Nothing else has to be reverted.

Anyone who already installed the broken version keeps it until the next release; there is no way to push them back down a version.

## The original project's pipeline

The instructions below can only be performed by Realm employees and describe the original project's pipeline. Realm Studio Plus has no access to it, and it publishes to an S3 bucket rather than to GitHub releases.

### Prepare a release

Start by preparing a release from the branch you want to release from (default: `master`).

The version is automatically derived from the CHANGELOG.md to comply with [semantic versioning](http://semver.org/),

Go to https://github.com/realm/realm-studio/actions and select "Prepare Release". Run the workflow, optionally adding a version number.

When preparing the action does the following:

1. Changes version based on release notes.
2. Updates package.json and package-lock.json
3. Commits the changes to a branch and pushes it to GitHub.
4. Creates a pull-request from the branch into master.

### Release a prepared release

Currently the release building is meant to be triggered by using the "Build, sign and publish release" workflow and selecting the release PR.

This workflow:

1. Builds and signs artifacts for macOS, Linux and Windows
2. Extract the latest release notes from the changelog.
3. Uploads the packaged artifacts and auto-update yaml files to S3
4. Creates a GitHub release, with the artifacts attached.
5. Merges the release PR.
6. Announces the release on Slack.

### How do I roll-back a release?

In the case where we've released something that needs to be rolled back we have the following options:

1. To prevent new users from downloading the broken version, unpublish the release on GitHub:
   1. Navigate to https://github.com/realm/realm-studio/releases/
   2. Find the latest (broken) release and click the "Edit" button
   3. Click "Save draft"
2. To prevent existing users from updating to the broken version, override the latest.yml files on S3 in one of two ways:
   1. Automatically: By going to https://ci.realm.io/job/realm-studio/job/release/build and starting a new build of a non-broken version.
   2. Manually: By downloading and re-uploading the .yml files that defines which is the latest version towards the auto updater:
      1. Find the latest successful build of the latest non-broken version on https://ci.realm.io/job/realm-studio/job/release/
      2. Download the `latest-linux.yml` `latest-mac.json` `latest-mac.yml` and `latest.yml` files
      3. Navigate to https://s3.console.aws.amazon.com/s3/buckets/static.realm.io/downloads/realm-studio/
      4. Upload and override the four .yml files to the S3 bucket.
