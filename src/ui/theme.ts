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

/**
 * Mirrors the resolved appearance onto <html data-bs-theme>, which is the
 * attribute both Bootstrap's colour mode and our own theme tokens key off
 * (see styles/_theme.scss).
 *
 * The renderer deliberately doesn't read the theme setting. The main process
 * pushes it into `nativeTheme.themeSource` (see src/main/theme.ts), and that in
 * turn decides what `prefers-color-scheme` matches here - so "system" resolves
 * itself, every window stays in sync, and there is no IPC on this path.
 */

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

export function startThemeSync(): () => void {
  const query = window.matchMedia(DARK_MODE_QUERY);
  const apply = () => {
    document.documentElement.setAttribute(
      'data-bs-theme',
      query.matches ? 'dark' : 'light'
    );
  };
  apply();
  query.addEventListener('change', apply);
  return () => {
    query.removeEventListener('change', apply);
  };
}
