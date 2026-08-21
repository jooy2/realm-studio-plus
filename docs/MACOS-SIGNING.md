# Signing and notarizing the macOS build

Releases before this change shipped an **unsigned** app: `mac.identity` was set to `null`, which tells electron-builder to skip code signing entirely. Because electron-builder rewrites the bundle after unpacking Electron, the signature Electron ships with is invalidated, and nothing re-signs it. macOS refuses to launch the result and reports it as damaged — see [issue #2](https://github.com/jooy2/realm-studio-plus/issues/2).

macOS builds must now be signed with a **Developer ID Application** certificate and notarized by Apple. `mac.forceCodeSigning` is enabled, so a build without a usable certificate fails loudly instead of silently producing a broken app.

macOS artifacts can therefore only be released from a Mac that holds the certificate. Linux and Windows builds are unaffected.

> **Use a personal Apple Developer account for this project, never an employer's.** Apple revokes Developer ID certificates per _team_, so a problem with this fork could invalidate every other app signed by the same team.

## One-time setup on the signing Mac

### 1. Requirements

- macOS with Xcode or the Command Line Tools installed — `codesign`, `stapler` and `notarytool` come from there. `notarytool` requires Xcode 13 or newer.
  ```bash
  xcode-select --install
  ```
- Membership in the [Apple Developer Program](https://developer.apple.com/programs/enroll/) ($99/year). Enrolling as an individual is enough; the account holder's legal name becomes part of the certificate and is visible to anyone who inspects the app with `codesign -dvv`.

### 2. Create the Developer ID Application certificate

The simplest route is Xcode → **Settings** → **Accounts** → select the account → **Manage Certificates…** → **+** → **Developer ID Application**.

Alternatively create a certificate signing request in Keychain Access (**Certificate Assistant** → **Request a Certificate From a Certificate Authority…**), upload it at [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates), then download and double-click the resulting `.cer`.

Confirm the identity is in the login keychain:

```bash
security find-identity -v -p codesigning
```

The output must contain a line like `1) ABCD… "Developer ID Application: Your Name (YOURTEAMID)"`. electron-builder discovers it automatically — no configuration is needed for the certificate.

Back the certificate up: export it from Keychain Access as a `.p12` and store it somewhere safe outside the repository. `*.p12` and `*.p8` are git-ignored.

### 3. Store the notarization credentials

Notarization is a separate credential from the signing certificate. Create a keychain profile once so that nothing secret ends up in a file:

```bash
xcrun notarytool store-credentials "realm-studio-plus" --apple-id "you@example.com" --team-id "YOURTEAMID" --password "app-specific-password"
```

The app-specific password comes from [account.apple.com](https://account.apple.com) → **Sign-In and Security** → **App-Specific Passwords**. It is only used here; after this command it lives in the login keychain and is not needed again.

To scope the credential more tightly, create an App Store Connect API key (**Users and Access** → **Integrations** → **Keys**, Developer role is sufficient) and pass `--key`, `--key-id` and `--issuer` to `store-credentials` instead. Unlike an app-specific password, an API key cannot reach iCloud Mail, Contacts or Calendar.

### 4. Point the project at the profile

```bash
cp electron-builder.env.example electron-builder.env
```

The example file already contains `APPLE_KEYCHAIN_PROFILE=realm-studio-plus`. Adjust it if you used a different profile name, or uncomment one of the other credential blocks instead. `electron-builder.env` is git-ignored; the electron-builder CLI loads it automatically from the project root, and `npm run notarize:dmg` reads the same file.

Real environment variables take precedence over the file, so a one-off build can override any of them without editing it.

## Building a release

```bash
npm ci
npm run release:mac
```

`release:mac` runs three steps:

1. `npm run package` — builds the bundle, signs both the x64 and arm64 `.app` bundles with the Developer ID certificate, submits each to Apple for notarization, staples the resulting ticket, and packs each into a `.dmg`.
2. `npm run notarize:dmg` — electron-builder notarizes the `.app` _before_ the disk image exists, so the `.dmg` carries no ticket of its own. This step submits each `.dmg` and staples it, so the file a user actually downloads passes Gatekeeper without contacting Apple.
3. `npm run verify:mac` — see below.

Notarization is a network round trip to Apple and usually takes a few minutes per submission. The steps can also be run individually.

### Local test builds without a certificate

`mac.forceCodeSigning` makes `npm run package` fail on a machine that has no Developer ID certificate. To produce a throwaway build for local testing there, override the signing options on the command line:

```bash
npx electron-builder --mac --publish=never --config.mac.forceCodeSigning=false --config.mac.notarize=false --config.mac.identity=null
```

The result is the unsigned bundle described at the top of this document. It only runs on the machine that built it, after clearing the quarantine attribute. Never publish it.

## Verifying before publishing

```bash
npm run verify:mac
```

For every `.app` and `.dmg` in `dist/` this checks that the artifact is signed with a Developer ID Application certificate, that the team identifier is set, that the hardened runtime is enabled, that the signature verifies with `--deep --strict`, that the notarization ticket is stapled, and that Gatekeeper accepts the app as `source=Notarized Developer ID`.

The last check is the one that matters — it is exactly what macOS does on the user's machine. Do not upload artifacts that fail it.

To sanity-check a downloaded release the same way:

```bash
codesign -dvv "/Applications/Realm Studio Plus.app"
```

## What the configuration does

The relevant part of `package.json`:

| Key | Purpose |
| --- | --- |
| `mac.forceCodeSigning` | Fail the build when no Developer ID identity is available, instead of silently shipping an unsigned app. |
| `mac.notarize` | Submit the signed `.app` to Apple and staple the ticket. |
| `mac.hardenedRuntime` | Required for notarization. |
| `mac.entitlements` / `entitlementsInherit` | `resources/entitlements.mac*.plist`. `com.apple.security.cs.disable-library-validation` is required — without it the hardened runtime refuses to load the `realm.node` native binding. |
| `dmg.sign` | Left `false`; electron-builder has not signed disk images by default since 20.43.0, and step 2 above notarizes them instead. |

`mac.identity` is deliberately absent so that electron-builder discovers the certificate from the keychain. Setting it back to `null` reintroduces issue #2.

## Troubleshooting

### `skipped macOS application code signing`, or the build fails on `forceCodeSigning`

The certificate is not in the keychain, or has expired. Check `security find-identity -v -p codesigning`.

### `notarize` options were unable to be generated

No credentials were found. Confirm `electron-builder.env` exists and that the keychain profile name matches, then re-run `xcrun notarytool store-credentials`.

### Notarization is rejected

Fetch the details — the log names the offending binary:

```bash
xcrun notarytool log <submission-id> --keychain-profile "realm-studio-plus"
```

The usual cause is a nested binary that was not signed or is missing the hardened runtime flag.

### Users of an older release still see "damaged"

Releases up to 20.1.0 are unsigned and cannot be repaired by Gatekeeper. Those users have to clear the quarantine attribute once, or upgrade to a signed release:

```bash
xattr -dr com.apple.quarantine "/Applications/Realm Studio Plus.app"
```
