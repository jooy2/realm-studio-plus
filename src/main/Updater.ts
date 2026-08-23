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

import { app, dialog, shell } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import * as semver from 'semver';

import { GITHUB_OWNER, GITHUB_REPO, LATEST_RELEASE_URL } from '../constants';
import { WindowManager } from './WindowManager';

const isDevelopment = process.env.NODE_ENV === 'development';

const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// Give up on the GitHub API rather than leave the check spinning forever.
const LATEST_RELEASE_TIMEOUT = 10000;

export interface IDownloadProgress {
  total: number;
  downloaded: number;
}

export interface IUpdateStatus {
  state:
    | 'checking'
    | 'failed'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing';
  progress?: IDownloadProgress;
  error?: string;
  nextVersion?: string;
}

export class Updater {
  private isBusy = false;
  private quite = false;
  private listeningWindows: Electron.BrowserWindow[] = [];
  private nextVersion?: string;
  private windowManager: WindowManager;

  constructor(windowManager: WindowManager) {
    this.windowManager = windowManager;

    // Disabling auto download of updates
    autoUpdater.autoDownload = false;

    // Registering event listners
    autoUpdater.on('checking-for-update', () => {
      this.isBusy = true;
      this.sendUpdateStatus({
        state: 'checking'
      });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.nextVersion = info.version;
      this.sendUpdateStatus({
        state: 'available',
        nextVersion: this.nextVersion
      });
      this.onUpdateAvailable(info);
    });

    autoUpdater.on('update-not-available', (_info: UpdateInfo) => {
      this.isBusy = false;
      this.sendUpdateStatus({
        state: 'up-to-date'
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.sendUpdateStatus({
        state: 'downloading',
        nextVersion: this.nextVersion,
        progress: {
          total: progress.total,
          downloaded: progress.transferred
        }
      });
    });

    autoUpdater.on('error', (err) => {
      this.onUpdateError(err);
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.sendUpdateStatus({
        state: 'downloaded',
        nextVersion: this.nextVersion
      });
      this.onUpdateDownloaded(info);
    });
  }

  public destroy() {
    autoUpdater.removeAllListeners('checking-for-update');
    autoUpdater.removeAllListeners('download-progress');
    autoUpdater.removeAllListeners('error');
    autoUpdater.removeAllListeners('update-available');
    autoUpdater.removeAllListeners('update-downloaded');
    autoUpdater.removeAllListeners('update-not-available');
  }

  public addListeningWindow(window: Electron.BrowserWindow) {
    this.listeningWindows.push(window);
  }

  public removeListeningWindow(window: Electron.BrowserWindow) {
    const index = this.listeningWindows.indexOf(window);
    this.listeningWindows.splice(index, 1);
  }

  public checkForUpdates(quiet = false) {
    // Checking this prevents two updates at the same time
    if (!this.isBusy) {
      this.quite = quiet;
      if (isDevelopment) {
        this.performFakeUpdate();
      } else {
        autoUpdater.checkForUpdates().catch((err: Error) => {
          console.error(`Failed checking for update: ${err.stack}`);
        });
      }
    }
  }

  public performFakeUpdate() {
    const PROGRESS_POLL_DELAY = 250;
    // Wait 1 second
    setTimeout(() => {
      this.nextVersion = 'v.1.2.3';
      this.sendUpdateStatus({
        state: 'available',
        nextVersion: this.nextVersion
      });
      const total = 60 * 1024 * 1024;
      const duration = 10000;
      let downloaded = 0;
      const timer = setInterval(() => {
        downloaded += (total / duration) * PROGRESS_POLL_DELAY;
        downloaded = Math.min(total, downloaded); // Enforcing the upper bound
        this.sendUpdateStatus({
          state: 'downloading',
          nextVersion: this.nextVersion,
          progress: {
            downloaded,
            total
          }
        });
        // Stop the timer - and go to installing
        if (downloaded === total) {
          clearTimeout(timer);
          this.sendUpdateStatus({
            state: 'downloaded',
            nextVersion: this.nextVersion
          });
          setTimeout(() => {
            this.sendUpdateStatus({
              state: 'installing',
              nextVersion: this.nextVersion
            });
            setTimeout(() => {
              this.sendUpdateStatus({
                state: 'up-to-date'
              });
            }, 2000);
          }, 5000);
        }
      }, PROGRESS_POLL_DELAY);
    }, 1000);
  }

  private askToUpdate(latestVersion: string) {
    if (process.env.REALM_STUDIO_DISABLE_UPDATE_PROMPT) {
      return true;
    } else {
      const appName = app.name;
      const currentVersion = app.getVersion();
      return (
        dialog.showMessageBoxSync({
          type: 'info',
          message: `A new version of ${appName} is available!`,
          detail: `${appName} ${latestVersion} is available - you have ${currentVersion}.\nWould you like to update it now?`,
          buttons: ['Yes', 'No'],
          defaultId: 0,
          cancelId: 1
        }) === 0
      );
    }
  }

  private askToRestart(latestVersion: string) {
    if (process.env.REALM_STUDIO_DISABLE_UPDATE_PROMPT) {
      return true;
    } else {
      const appName = app.name;
      return (
        dialog.showMessageBoxSync({
          type: 'info',
          message: `A new version of ${appName} is downloaded!`,
          detail: `${appName} ${latestVersion} is downloaded.\nClick "Ok" to quit and restart Realm Studio.`,
          buttons: ['Ok'],
          defaultId: 0
        }) === 0
      );
    }
  }

  private onUpdateAvailable(info: UpdateInfo) {
    // Show a dialog synchronously
    const shouldDownload = this.askToUpdate(info.version);
    // Quit and install
    if (shouldDownload) {
      autoUpdater.downloadUpdate();
    } else {
      this.isBusy = false;
      // If the user rejects an update, we'll tell the window manager
      this.windowManager.setPendingUpdate(true);
    }
  }

  private onUpdateDownloaded(info: UpdateInfo) {
    // Show a dialog synchronously
    const shouldQuitAndInstall = this.askToRestart(info.version);
    // Quit and install
    if (shouldQuitAndInstall) {
      autoUpdater.quitAndInstall(true, true);
    }
  }

  /**
   * electron-updater can only check for - and install - an update when the
   * release carries the `latest*.yml` metadata that electron-builder writes
   * next to the installers, and when the artifact for this platform is one it
   * knows how to install. Releases published by hand, and the .deb/.rpm builds,
   * are neither. Ask the GitHub API directly in that case and point the user at
   * the release page instead of reporting a failure.
   */
  private async onUpdateError(err: Error) {
    try {
      const latestVersion = await this.getLatestReleasedVersion();
      if (latestVersion === undefined) {
        // The fallback failed as well, so report the original error
        if (!this.quite) {
          this.showError('Error occurred while updating', err.message);
        }
        this.sendUpdateStatus({
          state: 'failed',
          error: err.message
        });
        return;
      }

      if (!semver.gt(latestVersion, app.getVersion())) {
        console.log(
          `Failed checking for update, but ${latestVersion} is the latest ` +
            `release: ${err.message}`
        );
        this.sendUpdateStatus({
          state: 'up-to-date'
        });
        return;
      }

      console.log(
        `Cannot update automatically to ${latestVersion}: ${err.message}`
      );
      this.nextVersion = latestVersion;
      this.sendUpdateStatus({
        state: 'available',
        nextVersion: latestVersion
      });
      if (this.askToDownloadManually(latestVersion)) {
        shell.openExternal(LATEST_RELEASE_URL);
      }
      // The update is not applied either way - the window titles should say so
      this.windowManager.setPendingUpdate(true);
    } finally {
      this.isBusy = false;
    }
  }

  private async getLatestReleasedVersion(): Promise<string | undefined> {
    try {
      const response = await fetch(LATEST_RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(LATEST_RELEASE_TIMEOUT)
      });
      if (!response.ok) {
        throw new Error(
          `Got status ${response.status} from ${LATEST_RELEASE_API_URL}`
        );
      }
      const release = (await response.json()) as { tag_name?: string };
      // Releases are tagged both as "20.1.0" and "v20.1.0"
      const tag = (release.tag_name ?? '').replace(/^v/, '');
      const version = semver.valid(tag);
      if (version === null) {
        throw new Error(`Could not read a version from the tag "${tag}"`);
      }
      return version;
    } catch (err) {
      console.error(
        `Failed asking GitHub for the latest release: ${
          err instanceof Error ? err.message : err
        }`
      );
      return undefined;
    }
  }

  private askToDownloadManually(latestVersion: string) {
    if (process.env.REALM_STUDIO_DISABLE_UPDATE_PROMPT) {
      // Opening a browser is never what an automated update test wants
      return false;
    } else {
      const appName = app.name;
      const currentVersion = app.getVersion();
      return (
        dialog.showMessageBoxSync({
          type: 'info',
          message: `A new version of ${appName} is available!`,
          detail: `${appName} ${latestVersion} is available - you have ${currentVersion}.\nThis release cannot be installed automatically.\nWould you like to open the download page?`,
          buttons: ['Open the download page', 'Not now'],
          defaultId: 0,
          cancelId: 1
        }) === 0
      );
    }
  }

  private showError(message: string, detail = '') {
    dialog.showMessageBox({
      type: 'error',
      message,
      detail
    });
  }

  private sendUpdateStatus(status: IUpdateStatus) {
    this.listeningWindows.forEach((window) => {
      window.webContents.send('update-status', status);
    });
  }
}
