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

import assert from 'assert';
import { DOMWindow, JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { IRealmLoadingComponentState, RealmLoadingComponent } from './index';
import { describe } from 'mocha';

interface Global {
  document: Document;
  window: DOMWindow;
}
// This is needed for renderIntoDocument to work
declare let global: Global;

describe('<RealmLoadingComponent />', () => {
  before(() => {
    const doc = new JSDOM();
    global.window = doc.window;
    global.document = doc.window.document;
  });

  describe('when subclassed', () => {
    let changes = 0;
    let loads = 0;
    class TestRealmLoadingComponent extends RealmLoadingComponent<
      Record<string, never>,
      IRealmLoadingComponentState
    > {
      public render() {
        return null;
      }

      protected onRealmChanged = () => {
        changes++;
      };

      protected onRealmSchemaChanged = () => {
        changes++;
      };

      protected onRealmLoaded = () => {
        loads++;
      };
    }

    it('renders, without loading or changing', () => {
      const container = document.createElement('div');
      const root = createRoot(container);
      act(() => {
        root.render(<TestRealmLoadingComponent />);
      });
      assert.strictEqual(changes, 0, 'Expected no changes');
      assert.strictEqual(loads, 0, 'Expected no loads');
    });
  });
});
