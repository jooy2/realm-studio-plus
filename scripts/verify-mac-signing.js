/*
 * Verifies that the packaged macOS artifacts are signed with a Developer ID
 * identity, notarized by Apple and have the notarization ticket stapled.
 *
 * Run this after `npm run package` and before uploading anything to a release.
 * See docs/MACOS-SIGNING.md for the full release procedure.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '../dist');

let failures = 0;

function run(command, args) {
  try {
    // codesign, spctl and stapler all report on stderr, so merge the streams.
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
    };
  } catch (error) {
    return {
      ok: false,
      output:
        `${error.stdout || ''}${error.stderr || ''}`.trim() || error.message
    };
  }
}

function check(label, passed, detail) {
  if (passed) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail) {
      console.log(
        detail
          .split('\n')
          .map((line) => `          ${line}`)
          .join('\n')
      );
    }
  }
}

function findApps() {
  if (!fs.existsSync(DIST_DIR)) {
    return [];
  }
  return fs
    .readdirSync(DIST_DIR)
    .filter((entry) => entry === 'mac' || entry.startsWith('mac-'))
    .flatMap((entry) => {
      const dir = path.join(DIST_DIR, entry);
      if (!fs.statSync(dir).isDirectory()) {
        return [];
      }
      return fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.app'))
        .map((name) => path.join(dir, name));
    });
}

function findDmgs() {
  if (!fs.existsSync(DIST_DIR)) {
    return [];
  }
  return fs
    .readdirSync(DIST_DIR)
    .filter((name) => name.endsWith('.dmg'))
    .map((name) => path.join(DIST_DIR, name));
}

function verifyApp(appPath) {
  console.log(`\n${path.relative(DIST_DIR, appPath)}`);

  const display = run('codesign', ['-dvvv', appPath]);
  const authority = /^Authority=(.+)$/m.exec(display.output);
  const teamId = /^TeamIdentifier=(.+)$/m.exec(display.output);

  check(
    'signed with a Developer ID Application certificate',
    Boolean(authority) && authority[1].startsWith('Developer ID Application:'),
    authority ? `Authority=${authority[1]}` : display.output
  );
  check(
    'team identifier is set',
    Boolean(teamId) && teamId[1] !== 'not set',
    teamId ? `TeamIdentifier=${teamId[1]}` : display.output
  );

  const runtime = /flags=.*runtime/.test(display.output);
  check('hardened runtime enabled', runtime, display.output);

  // --deep walks the nested helpers and the unpacked realm.node binding.
  const verify = run('codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appPath
  ]);
  check('signature verifies (--deep --strict)', verify.ok, verify.output);

  const staple = run('xcrun', ['stapler', 'validate', appPath]);
  check('notarization ticket stapled', staple.ok, staple.output);

  // The only check that reflects what Gatekeeper does on the user's machine.
  const assess = run('spctl', [
    '--assess',
    '--type',
    'execute',
    '-vvv',
    appPath
  ]);
  check(
    'accepted by Gatekeeper as Notarized Developer ID',
    assess.ok && /source=Notarized Developer ID/.test(assess.output),
    assess.output
  );
}

function verifyDmg(dmgPath) {
  console.log(`\n${path.basename(dmgPath)}`);

  const staple = run('xcrun', ['stapler', 'validate', dmgPath]);
  check('notarization ticket stapled', staple.ok, staple.output);
}

const apps = findApps();
const dmgs = findDmgs();

if (apps.length === 0 && dmgs.length === 0) {
  console.error(
    'No packaged macOS artifacts found in ./dist — run `npm run package` first.'
  );
  process.exit(1);
}

apps.forEach(verifyApp);
dmgs.forEach(verifyDmg);

console.log('');

if (failures > 0) {
  console.error(
    `${failures} check(s) failed — do not publish these artifacts. See docs/MACOS-SIGNING.md.`
  );
  process.exit(1);
}

console.log('All macOS signing checks passed.');
