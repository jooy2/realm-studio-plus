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

import { HistoryEntry, IHistoryEntry } from './HistoryEntry';

const Empty = () => (
  <div className="Greeting__HistoryPanel__Empty">
    <p>No recently opened files</p>
  </div>
);

interface IHistoryPanelProps {
  entries: IHistoryEntry[];
  onOpen?: (entry: IHistoryEntry) => void;
  onRemove?: (entry: IHistoryEntry) => void;
}

export const HistoryPanel = ({
  entries,
  onOpen,
  onRemove
}: IHistoryPanelProps) => (
  <div className="Greeting__HistoryPanel">
    <h6 className="Greeting__HistoryPanel__Header">Recently opened</h6>
    <div className="Greeting__HistoryPanel__List">
      {entries.length === 0 ? (
        <Empty />
      ) : (
        entries.map((entry, index) => (
          <HistoryEntry
            entry={entry}
            key={index}
            onOpen={onOpen}
            onRemove={onRemove}
          />
        ))
      )}
    </div>
  </div>
);
