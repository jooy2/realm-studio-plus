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

import { nativeTheme } from 'electron';

import { settings, ThemeMode } from '../services/settings';

/**
 * The theme setting is pushed into Electron's `nativeTheme.themeSource`, which
 * is what makes the whole thing work with so little wiring:
 *
 *  - Electron resolves "system" against the OS preference for us, and keeps
 *    resolving it when the user changes their OS appearance.
 *  - `themeSource` drives the `prefers-color-scheme` media query in *every*
 *    renderer, so all open windows switch together and the renderer never has
 *    to read the setting itself (see src/ui/theme.ts).
 *  - Native chrome - menus, dialogs, scrollbars - follows along.
 */

/** Must match `$window-background` in styles/variables/_colors.scss */
export const WINDOW_BACKGROUND_LIGHT = '#f5f5f9';
/** Must match `$dark-window-background` in styles/variables/_colors.scss */
export const WINDOW_BACKGROUND_DARK = '#141829';

export function applyThemeMode(mode: ThemeMode = settings.getTheme()) {
  nativeTheme.themeSource = mode;
}

/**
 * The colour a window is painted with before its renderer has produced a
 * frame. Getting this wrong is what makes an app flash white on launch.
 */
export function getWindowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors
    ? WINDOW_BACKGROUND_DARK
    : WINDOW_BACKGROUND_LIGHT;
}

/**
 * Calls back when the *resolved* appearance changes - either because the
 * setting changed or, in "system" mode, because the OS appearance did.
 * Returns a function that removes the listener again.
 */
export function onResolvedThemeChange(callback: () => void): () => void {
  nativeTheme.on('updated', callback);
  return () => {
    nativeTheme.removeListener('updated', callback);
  };
}
