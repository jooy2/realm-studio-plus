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

import electron from 'electron';
import * as remote from '@electron/remote';
import React from 'react';

import { main } from '../../actions/main';
import { IUpdateStatus } from '../../main/Updater';
import {
  getRecentFiles,
  IRecentFile,
  removeRecentFile
} from '../../services/recent-files';
import { IMenuGeneratorProps } from '../../windows/MenuGenerator';

import { Greeting } from './Greeting';
import { IHistoryEntry } from './HistoryPanel/HistoryEntry';

interface IGreetingContainerState {
  recentFiles: IRecentFile[];
  updateStatus: IUpdateStatus;
  version: string;
}

class GreetingContainer extends React.Component<
  IMenuGeneratorProps,
  IGreetingContainerState
> {
  public state: IGreetingContainerState = {
    recentFiles: getRecentFiles(),
    updateStatus: {
      state: 'up-to-date'
    },
    version: remote.app.getVersion() || 'unknown'
  };

  public componentDidMount() {
    electron.ipcRenderer.on('update-status', this.updateStatusChanged);
    window.addEventListener('focus', this.refreshRecentFiles);
  }

  public componentWillUnmount() {
    electron.ipcRenderer.removeListener(
      'update-status',
      this.updateStatusChanged
    );
    window.removeEventListener('focus', this.refreshRecentFiles);
  }

  public render() {
    const entries: IHistoryEntry[] = this.state.recentFiles.map((file) => ({
      path: file.path
    }));
    return (
      <Greeting
        {...this.state}
        {...this}
        historyEntries={entries}
        onOpenRecentFile={this.onOpenRecentFile}
        onRemoveRecentFile={this.onRemoveRecentFile}
      />
    );
  }

  public onOpenLocalRealm = () => {
    main.showOpenLocalRealm().then(this.refreshRecentFiles);
  };

  public onCheckForUpdates = () => {
    main.checkForUpdates();
  };

  public updateStatusChanged = (
    e: Electron.IpcRendererEvent,
    status: IUpdateStatus
  ) => {
    this.setState({ updateStatus: status });
  };

  private refreshRecentFiles = () => {
    this.setState({ recentFiles: getRecentFiles() });
  };

  private onOpenRecentFile = (entry: IHistoryEntry) => {
    main.showOpenLocalRealmAtPath(entry.path);
  };

  private onRemoveRecentFile = (entry: IHistoryEntry) => {
    removeRecentFile(entry.path);
    this.refreshRecentFiles();
  };
}

export { GreetingContainer as Greeting };
