# TODO

Known issues and deferred work, recorded during the 2026-08-06 dependency upgrade
and the sass-lint → stylelint migration. Nothing here is blocking: `npm run lint`,
`npm test`, `npm run build` and `npm ci` all pass as of that date.

## 1. Migrate Sass `@import` to the module system (`@use` / `@forward`)

**Why:** `@import` is deprecated and will be **removed in Dart Sass 3.0.0**. It is the
sole cause of the remaining 19 build warnings.

The related `mix()` → `color.mix()` deprecation has already been fixed (`@use "sass:color"`
in `src/ui/RealmBrowser/variables.scss`, `src/ui/reusable/Sidebar/variables.scss`,
`src/ui/RealmBrowser/RealmBrowser.scss`, `styles/variables/_colors.scss`).

**Why deferred:** this is not a mechanical rename. `@use` changes variable scoping —
partials such as `src/ui/RealmBrowser/variables.scss` currently rely on `$black`,
`$dove`, `$elephant` etc. being injected by whoever imports them. Each partial has to
declare its own dependencies before it can be converted.

Start with `sass-migrator module --migrate-deps styles/index.scss`, then verify the
compiled CSS is unchanged rather than trusting the migrator.

## 2. TypeScript 7

Currently pinned to `^6.0.3`. TypeScript 7 (the native Go port) was tried and reverted —
**two hard blockers**:

- `ts-loader` crashes the whole webpack build:
  `TypeError: Cannot read properties of undefined (reading 'fileExists')`
- `typescript-eslint` refuses to load: `"typescript-eslint does not support TS 7.0"`
  (peer range is `>=4.8.4 <6.1.0`). Tracking issue:
  https://github.com/typescript-eslint/typescript-eslint/issues/10940

Also note: TS 7 removes the `downlevelIteration` compiler option, so
`tsconfig.json` needs that line dropped. It is a no-op today (`target: esnext`).

Revisit once `ts-loader` and `typescript-eslint` ship TS 7 support.

## 3. ESLint 10

Currently pinned to `9.39.5`. ESLint 10 was tried and reverted — it removes the
deprecated `context` / `SourceCode` methods, which crashes `eslint-plugin-react`:

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
```

Three plugins still declare `eslint: ^9` as their maximum peer and have no newer
release: `eslint-plugin-react` (7.37.5), `eslint-plugin-import` (2.32.0),
`eslint-plugin-jsx-a11y` (6.10.2). Revisit when those support v10.

## 4. Remove unused dependencies

None of the following are referenced anywhere in `src/`, `scripts/`, `configs/`,
`actions/`, `.github/` or `eslint.config.ts`:

| Package | Note |
| --- | --- |
| `electron-publisher-s3` | pulls in `aws-sdk` — the largest source of `npm audit` findings, no fix available |
| `electron-notarize` | deprecated; superseded by `@electron/notarize` |
| `@pmmmwh/react-refresh-webpack-plugin` | forces the `overrides` entry described in §5 |
| `react-refresh` | only needed by the plugin above |
| `webpack-visualizer-plugin` | last published 2016 |
| `commander`, `simple-git`, `remark`, `@octokit/rest`, `js-yaml` | leftovers |
| `contentful`, `@contentful/rich-text-*` | no import anywhere in `src/` |

`npm audit` currently reports 29 findings (1 low, 12 moderate, 14 high, 2 critical).
Most trace back to `electron-publisher-s3` → `aws-sdk`, `faker@6.6.6`,
`mocha-github-actions-reporter` (→ `diff`, `js-yaml`, `minimatch`, `nanoid`) and
`request` → `form-data`. Dropping the unused packages should clear a large share
of them without touching application code.

## 5. Drop the `@pmmmwh/react-refresh-webpack-plugin` override

`package.json` carries:

```json
"overrides": {
  "@pmmmwh/react-refresh-webpack-plugin": {
    "webpack-dev-server": "$webpack-dev-server"
  }
}
```

It exists only because that plugin pins `webpack-dev-server ^4.8.0 || 5.x`, which
makes a clean `npm install` fail with `ERESOLVE` now that the project is on
webpack-dev-server 6. The plugin is unused (see §4) — removing it removes the need
for the override.

## 6. `.nvmrc` and `engines.node` disagree

`.nvmrc` says `26.3.0`; `package.json` says `"node": "^24"`. Pick one. Note that
`jsdom@30` requires `^22.22.2 || ^24.15.0 || >=26.0.0`, so `^24` is looser than what
the dependency tree actually supports — a developer on Node 24.0.0 would fail.

## 7. The repository is not Prettier-clean

`npm run format` currently rewrites ~30 files (mostly `.scss` and `.tsx`, plus
`.github/no-response.yml`) that were never formatted. Worth doing as a single
isolated commit so it does not bury real changes in review.

Note that `.prettierignore` deliberately excludes
`src/services/schema-export/tests/models/` — those fixtures are compared
byte-for-byte against generator output, and formatting them breaks the tests.
Do not remove that entry.
