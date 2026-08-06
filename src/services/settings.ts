////////////////////////////////////////////////////////////////////////////
//
// Copyright 2018 Realm Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////

import ElectronStore from 'electron-store';

/**
 * User preferences, persisted as a plain JSON document in the user data
 * directory:
 *
 *     macOS    ~/Library/Application Support/<app>/settings.json
 *     Linux    ~/.config/<app>/settings.json
 *     Windows  %APPDATA%\<app>\settings.json
 *
 * This is deliberately a separate file from the `config.json` managed by
 * `src/store.ts`: that one holds machine state nobody is meant to edit (window
 * geometry, internal feature toggles), while this one is a small, documented,
 * hand-editable document.
 *
 * The file is watched, so an edit made from another window - or from a text
 * editor - is picked up without a restart.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

/** All valid theme modes, in the order they should be presented to the user */
export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

export const THEME_MODE_LABELS: Readonly<Record<ThemeMode, string>> = {
  system: 'Match System',
  light: 'Light',
  dark: 'Dark'
};

export interface ISettings {
  /**
   * Which appearance to use. "system" follows the operating system's own
   * light / dark preference.
   */
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: ISettings = {
  theme: 'system'
};

/** Becomes `settings.json` in the user data directory */
const SETTINGS_FILE_NAME = 'settings';

type RemovalCallback = () => void;

export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode);
}

/**
 * The subset of the store API the settings need. Having it as an interface
 * lets the settings work outside Electron - in unit tests, or when a module
 * that happens to import them is loaded by the test runner - instead of
 * throwing when `electron-store` cannot find the user data directory.
 */
interface ISettingsBackend {
  readonly path: string;
  get<K extends keyof ISettings>(key: K): ISettings[K];
  set<K extends keyof ISettings>(key: K, value: ISettings[K]): void;
  onDidChange<K extends keyof ISettings>(
    key: K,
    callback: (newValue?: ISettings[K], oldValue?: ISettings[K]) => void
  ): RemovalCallback;
}

class InMemorySettingsBackend implements ISettingsBackend {
  public readonly path = '';

  private values: ISettings = { ...DEFAULT_SETTINGS };

  public get<K extends keyof ISettings>(key: K): ISettings[K] {
    return this.values[key];
  }

  public set<K extends keyof ISettings>(key: K, value: ISettings[K]) {
    this.values[key] = value;
  }

  public onDidChange(): RemovalCallback {
    return () => undefined;
  }
}

class Settings {
  private backend: ISettingsBackend = createBackend();

  /** Absolute path of the settings file, empty when running outside Electron */
  public get path(): string {
    return this.backend.path;
  }

  public getTheme(): ThemeMode {
    const value = this.backend.get('theme');
    // The file is meant to be hand-editable, so don't trust its contents
    return isThemeMode(value) ? value : DEFAULT_SETTINGS.theme;
  }

  public setTheme(theme: ThemeMode) {
    if (!isThemeMode(theme)) {
      throw new Error(`Not a valid theme: ${theme}`);
    }
    this.backend.set('theme', theme);
  }

  /**
   * Calls back whenever the theme changes - including when the change was made
   * by another window or by editing the file directly. Returns a function that
   * removes the listener again.
   */
  public onDidChangeTheme(
    callback: (theme: ThemeMode) => void
  ): RemovalCallback {
    return this.backend.onDidChange('theme', (newValue) => {
      callback(isThemeMode(newValue) ? newValue : DEFAULT_SETTINGS.theme);
    });
  }
}

function createBackend(): ISettingsBackend {
  if (!process.type) {
    console.warn('Running outside electron, settings will not be persisted');
    return new InMemorySettingsBackend();
  }
  const store = new ElectronStore<ISettings>({
    name: SETTINGS_FILE_NAME,
    defaults: DEFAULT_SETTINGS,
    // Pick up changes made by other windows and by hand
    watch: true,
    // A hand-edited file can end up unparsable - start over rather than refuse
    // to launch
    clearInvalidConfig: true
  });
  return {
    get path() {
      return store.path;
    },
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    // electron-store types this as void, but it does return an unsubscribe
    // function - the same workaround src/store.ts uses.
    onDidChange: (key, callback) =>
      store.onDidChange(key, callback) as unknown as RemovalCallback
  };
}

export const settings = new Settings();
