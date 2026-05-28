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

import fs from 'fs-extra';
import path from 'path';

import { getElectronOrRemote } from '../utils/electron-or-remote';

export interface IRecentFile {
  path: string;
  openedAt: number;
}

const MAX_RECENT_FILES = 5;
const FILE_NAME = 'recent-files.json';

const getStorePath = (): string => {
  const userDataPath = getElectronOrRemote().app.getPath('userData');
  return path.resolve(userDataPath, FILE_NAME);
};

export const getRecentFiles = (): IRecentFile[] => {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    return [];
  }
  try {
    const data = fs.readJsonSync(storePath);
    if (!data || !Array.isArray(data.files)) {
      return [];
    }
    return (data.files as IRecentFile[])
      .filter((entry) => entry && typeof entry.path === 'string')
      .sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0))
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
};

const writeRecentFiles = (files: IRecentFile[]): void => {
  const storePath = getStorePath();
  fs.writeJsonSync(storePath, { files });
};

export const addRecentFile = (filePath: string): void => {
  const existing = getRecentFiles().filter((entry) => entry.path !== filePath);
  const next = [{ path: filePath, openedAt: Date.now() }, ...existing].slice(
    0,
    MAX_RECENT_FILES
  );
  writeRecentFiles(next);
};

export const removeRecentFile = (filePath: string): void => {
  const next = getRecentFiles().filter((entry) => entry.path !== filePath);
  writeRecentFiles(next);
};
