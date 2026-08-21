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

import path from 'path';

export interface IHistoryEntry {
  path: string;
}

interface IHistoryEntryProps {
  entry: IHistoryEntry;
  onOpen?: (entry: IHistoryEntry) => void;
  onRemove?: (entry: IHistoryEntry) => void;
}

export const HistoryEntry = ({
  entry,
  onOpen,
  onRemove
}: IHistoryEntryProps) => {
  const fileName = path.basename(entry.path);
  return (
    <div
      className="Greeting__HistoryPanel__Entry Greeting__HistoryPanel__Entry--clickable"
      title={entry.path}
      onClick={() => onOpen && onOpen(entry)}
    >
      <i
        className="fa fa-file-o Greeting__HistoryPanel__Icon Greeting__HistoryPanel__Icon--fa"
        aria-hidden="true"
      />
      <div className="Greeting__HistoryPanel__Description">
        <div className="Greeting__HistoryPanel__Name">{fileName}</div>
        <div className="Greeting__HistoryPanel__Path">{entry.path}</div>
      </div>
      {onRemove && (
        <button
          type="button"
          className="Greeting__HistoryPanel__Remove"
          title="Remove from list"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(entry);
          }}
        >
          <i className="fa fa-trash" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
