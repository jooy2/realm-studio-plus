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

if (process.type === 'browser') {
  throw new Error("Renderer bundle shouldn't be loaded from the main process");
}

import './services/mixpanel';

// Must run before any `react-dom/*` import — see file for rationale.
import './utils/disable-react-profiling';

import * as remote from '@electron/remote';
import React from 'react';
import { createRoot } from 'react-dom/client';

// This is needed to prevent Realm JS from writing to directories it doesn't have access to
import './utils/process-directories';

const { app } = remote;
const isDevelopment = process.env.NODE_ENV === 'development';

// Don't report Realm JS analytics data
// @see https://github.com/realm/realm-js/blob/master/lib/submit-analytics.js#L28
process.env.REALM_DISABLE_ANALYTICS = 'true';

import '../styles/index.scss';

import { startThemeSync } from './ui/theme';
import { CurrentWindow } from './windows/WindowComponent';

// Before the first render, so nothing is ever painted in the wrong appearance
startThemeSync();

const appElement = document.getElementById('app');
const root = appElement ? createRoot(appElement) : null;

if (!isDevelopment) {
  root?.render(<CurrentWindow />);
} else {
  // The react-hot-loader is a dev-dependency, why we cannot use a regular import in the top of this file

  function render(Component: React.FC) {
    root?.render(<Component />);
  }

  render(CurrentWindow);

  // Add a tool that will notify us when components update
  if (process.env.WHY_DID_YOU_UPDATE) {
    console.warn('Loading why-did-you-update');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { whyDidYouUpdate } = require('why-did-you-update');
    whyDidYouUpdate(React);
  }
}

// Using process.nextTick - as requiring realm blocks rendering
process.nextTick(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Realm = require('realm');
  // If sync is enabled on Realm - make it less verbose
  if (Realm.Sync) {
    Realm.Sync.setLogLevel(process.env.REALM_LOG_LEVEL || 'error');
    Realm.Sync.setUserAgent(`${app.name} ${app.getVersion() || 'unknown'}`);
  }
});
