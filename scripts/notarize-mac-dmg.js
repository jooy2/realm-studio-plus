/*
 * Notarizes and staples the packaged .dmg files.
 *
 * electron-builder notarizes and staples the .app bundle, but it does that
 * before the disk image is built, so the .dmg itself carries no ticket. This
 * script submits each .dmg to Apple and staples the result, so the download a
 * user actually receives passes Gatekeeper on its own.
 *
 * Credentials are read from the environment, using the same variables (and the
 * same precedence) as electron-builder. `electron-builder.env` in the project
 * root is loaded automatically. See docs/MACOS-SIGNING.md.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ENV_FILE = path.join(ROOT_DIR, 'electron-builder.env');

// Minimal dotenv reader — electron-builder loads this file itself, but only
// from its own CLI, so we have to read it again here.
function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    return;
  }
  fs.readFileSync(ENV_FILE, 'utf8')
    .split('\n')
    .forEach((rawLine) => {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('#')) {
        return;
      }
      const separator = line.indexOf('=');
      if (separator === -1) {
        return;
      }
      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2');
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    });
}

function resolveCredentials() {
  const {
    APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID,
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_API_ISSUER,
    APPLE_KEYCHAIN,
    APPLE_KEYCHAIN_PROFILE
  } = process.env;

  if (APPLE_ID || APPLE_APP_SPECIFIC_PASSWORD) {
    if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
      throw new Error(
        'APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID must all be set'
      );
    }
    return {
      description: `Apple ID ${APPLE_ID}`,
      args: [
        '--apple-id',
        APPLE_ID,
        '--password',
        APPLE_APP_SPECIFIC_PASSWORD,
        '--team-id',
        APPLE_TEAM_ID
      ]
    };
  }

  if (APPLE_API_KEY || APPLE_API_KEY_ID || APPLE_API_ISSUER) {
    if (!APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) {
      throw new Error(
        'APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER must all be set'
      );
    }
    return {
      description: `App Store Connect API key ${APPLE_API_KEY_ID}`,
      args: [
        '--key',
        APPLE_API_KEY,
        '--key-id',
        APPLE_API_KEY_ID,
        '--issuer',
        APPLE_API_ISSUER
      ]
    };
  }

  if (APPLE_KEYCHAIN_PROFILE) {
    const args = ['--keychain-profile', APPLE_KEYCHAIN_PROFILE];
    if (APPLE_KEYCHAIN) {
      args.push('--keychain', APPLE_KEYCHAIN);
    }
    return {
      description: `keychain profile "${APPLE_KEYCHAIN_PROFILE}"`,
      args
    };
  }

  throw new Error(
    'No notarization credentials found. Set APPLE_KEYCHAIN_PROFILE, or ' +
      'APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER, or ' +
      'APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID. ' +
      'See docs/MACOS-SIGNING.md.'
  );
}

loadEnvFile();

const dmgs = fs.existsSync(DIST_DIR)
  ? fs
      .readdirSync(DIST_DIR)
      .filter((name) => name.endsWith('.dmg'))
      .map((name) => path.join(DIST_DIR, name))
  : [];

if (dmgs.length === 0) {
  console.error(
    'No .dmg files found in ./dist — run `npm run package` on macOS first.'
  );
  process.exit(1);
}

const credentials = resolveCredentials();
console.log(`Notarizing with ${credentials.description}\n`);

dmgs.forEach((dmg) => {
  console.log(`Submitting ${path.basename(dmg)} …`);
  execFileSync(
    'xcrun',
    ['notarytool', 'submit', dmg, ...credentials.args, '--wait'],
    { stdio: 'inherit' }
  );
  console.log(`Stapling ${path.basename(dmg)} …`);
  execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
  console.log('');
});

console.log('Done. Run `npm run verify:mac` to confirm.');
