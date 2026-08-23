# Releasing Realm Studio Plus

> **macOS:** the `.dmg` and `.zip` artifacts have to be signed and notarized, which can only be done on a Mac holding the project's Developer ID certificate. See [MACOS-SIGNING.md](MACOS-SIGNING.md) for that part of the release.

## What the auto updater needs from a release

Studio checks for updates against the releases of this repository. `build.publish` in `package.json` names it, and electron-builder copies those coordinates into the `app-update.yml` that ships inside the package — the packaged app has no other source of update information.

electron-updater does not read the release page. It reads the metadata that electron-builder writes into `dist/` while packaging:

| File               | Platform |
| ------------------ | -------- |
| `latest-mac.yml`   | macOS    |
| `latest.yml`       | Windows  |
| `latest-linux.yml` | Linux    |

**These files have to be uploaded to the release along with the installers**, together with the `.blockmap` files next to them. They are what turns a release into an update: a release carrying only installers is invisible to the updater.

Only the newest published release is considered, and GitHub excludes drafts and prereleases from it. Publishing the release is therefore the step that hands the update to everyone.

Not every artifact can be installed by the updater:

| Artifact | Update |
| --- | --- |
| `realm-studio-plus-<version>-<arch>.zip` | Installed. This is what the updater applies on macOS |
| `realm-studio-plus-<version>-<arch>.dmg` | First-time downloads only — electron-updater cannot install a `.dmg` |
| `realm-studio-plus-<version>-<arch>-setup.exe` | Installed |
| `realm-studio-plus-<version>-<arch>-portable.exe` | Not updatable — the portable build is a single file the user placed themselves |
| `.AppImage`, `.deb`, `.rpm` | Installed; `.deb` and `.rpm` ask for a password |

When the metadata is missing, or the artifact for this platform cannot be installed, the app asks the GitHub releases API for the latest tag and offers to open the release page instead — see [`src/main/Updater.ts`](../src/main/Updater.ts). That path only notifies, it never installs, so it is a safety net and not a substitute for uploading the metadata.

Artifact names must not contain spaces, which is why `artifactName` has none. GitHub turns a space into a `.` when the file is uploaded through the web UI, electron-builder turns it into a `-` when it publishes, and electron-updater only looks for the `-` form — a name with spaces therefore resolves only when the release happens to have been uploaded by electron-builder itself.

## Cutting a release

1. Bump `version` in `package.json`, refresh `package-lock.json` with `npm i --package-lock-only`, and move the `vNext` section of [CHANGELOG.md](../CHANGELOG.md) under the new version heading.
2. Build on each platform. Every run leaves that platform's installers _and_ its `latest*.yml` in `dist/`:
   - macOS, on the signing Mac: `npm run release:mac` (package, notarize the disk images, verify).
   - Windows: `npm run package`.
   - Linux: `npm run package`.
3. Collect the artifacts of all three into a single release, by hand or with electron-builder.
4. Check that the release has the three `latest*.yml` files, then publish it.

Uploading by hand, with the [`gh`](https://cli.github.com) CLI:

```bash
node ./scripts/extract-changelog.mjs > ./RELEASENOTES.md
gh release create v20.2.0 --draft --title v20.2.0 --notes-file ./RELEASENOTES.md
gh release upload v20.2.0 dist/latest*.yml dist/*.dmg dist/*.zip dist/*.exe dist/*.AppImage dist/*.deb dist/*.rpm dist/*.blockmap
```

Letting electron-builder upload, which needs a `GH_TOKEN` with the `repo` scope:

```bash
GH_TOKEN=… npx electron-builder -wl --publish always
```

It creates - or reuses - a **draft** release tagged `v<version>` and uploads the artifacts and the metadata for the platforms it built. Do not use it for macOS: the disk images are stapled after electron-builder has already finished (see [MACOS-SIGNING.md](MACOS-SIGNING.md)), so publishing from the same command uploads images without a notarization ticket.

## Rolling back a release

Edit the broken release on GitHub and save it back as a draft. `/releases/latest` then resolves to the previous release again, and both the updater and the release-page fallback follow it - the update metadata lives in the release itself, so unpublishing it retracts the update. Nothing else has to be reverted.

## The original project's pipeline

The instructions below are only possible to perform for Realm employees, and describe the original project's pipeline. Realm Studio Plus does not have access to it, and its artifacts are published to an S3 bucket rather than to GitHub releases.

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
