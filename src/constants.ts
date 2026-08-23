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

// Constants that can be used from either the main or render processes.
export const STUDIO_PROTOCOL = 'x-realm-studio';

// The GitHub repository that releases are published to. This has to match
// `build.publish` in package.json: electron-updater reads the release metadata
// from there and the updater falls back to the release page when it cannot.
export const GITHUB_OWNER = 'jooy2';
export const GITHUB_REPO = 'realm-studio-plus';
export const LATEST_RELEASE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
