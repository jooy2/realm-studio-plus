////////////////////////////////////////////////////////////////////////////
//
// Copyright 2019 Realm Inc.
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

import { ipcRenderer, MenuItemConstructorOptions } from 'electron';
import * as remote from '@electron/remote';
import fs from 'fs-extra';
import path from 'path';
import Realm from 'realm';
import { flushSync } from 'react-dom';

import { DataExporter, DataExportFormat } from '../../services/data-exporter';
import * as dataImporter from '../../services/data-importer';
import { Language, SchemaExporter } from '../../services/schema-export';
import { menu, realms } from '../../utils';
import {
  IMenuGenerator,
  IMenuGeneratorProps
} from '../../windows/MenuGenerator';
import { IRealmBrowserWindowProps } from '../../windows/WindowProps';
import { showError } from '../reusable/errors';
import {
  IRealmLoadingComponentState,
  RealmLoadingComponent
} from '../reusable/RealmLoadingComponent';

import { Content, EditMode } from './Content';
import {
  Focus,
  generateKey,
  IClassFocus,
  IListFocus,
  ISingleObjectFocus
} from './focus';
import { isPrimitive } from './primitives';
import { RealmBrowser } from './RealmBrowser';
import * as schemaUtils from './schema-utils';
import { SingleObjectCollection } from './Content/SingleObjectCollection';
import { MockedObjectCollection } from './Content/MockedObjectCollection';

// TODO: Remove this interface once the Realm.ObjectSchemaProperty
// has a name parameter in its type definition.
export interface IPropertyWithName extends Realm.ObjectSchemaProperty {
  name: string | null;
  readOnly: boolean;
  isPrimaryKey: boolean;
  isEmbedded?: boolean;
}

export type IsEmbeddedTypeChecker = (className?: string) => boolean;
export type EditModeChangeHandler = (editMode: EditMode) => void;
export type ListFocussedHandler = (
  object: Realm.Object,
  property: IPropertyWithName,
  highlightedObject?: Realm.Object
) => void;
export type SingleListFocussedHandler = (
  parent: Realm.Object,
  property: IPropertyWithName
) => void;
export type ClassFocussedHandler = (
  className: string,
  highlightedObject?: Realm.Object
) => void;

type ImportDialogOptions = {
  filePaths: string[];
  classNames: string[];
};

type JsonViewerDialogOptions = {
  value: unknown;
};

export type JsonViewerDialogExecutor = (value: unknown) => void;

const EDIT_MODE_STORAGE_KEY = 'realm-browser-edit-mode';
const FILE_UPGRADE_NEEDED_MESSAGE = 'Database upgrade required but prohibited.';
const ARCHITECTURE_MISMATCH_MESSAGE =
  'Realm file is currently open in another process which cannot share access with this process. All processes sharing a single file must be the same architecture.';

export interface IRealmBrowserState extends IRealmLoadingComponentState {
  // A number that we can use to make components update on changes to data
  dataVersion: number;
  dataVersionAtBeginning?: number;
  allowCreate: boolean;
  editMode: EditMode;
  focus: Focus | null;
  isAddClassOpen: boolean;
  isAddPropertyOpen: boolean;
  isEncryptionDialogVisible: boolean;
  isLeftSidebarOpen: boolean;
  importDialog: ImportDialogOptions | null;
  jsonViewerDialog: JsonViewerDialogOptions | null;
  // The classes are only supposed to be used to produce a list of classes in the sidebar
  classes: Realm.ObjectSchema[];
}

class RealmBrowserContainer
  extends RealmLoadingComponent<
    IRealmBrowserWindowProps & IMenuGeneratorProps,
    IRealmBrowserState
  >
  implements IMenuGenerator
{
  public state: IRealmBrowserState = {
    dataVersion: 0,
    allowCreate: false,
    editMode:
      (localStorage.getItem(EDIT_MODE_STORAGE_KEY) as EditMode) ||
      EditMode.InputBlur,
    focus: null,
    isAddClassOpen: false,
    isAddPropertyOpen: false,
    isEncryptionDialogVisible: false,
    isLeftSidebarOpen: true,
    importDialog: null,
    jsonViewerDialog: null,
    progress: { status: 'idle' },
    classes: []
  };

  private contentInstance: Content | null = null;
  private fileWatcher: fs.FSWatcher | null = null;
  private watchedInode: number | null = null;
  private watchedMtimeMs: number | null = null;
  private watchedSize: number | null = null;
  private watchedFileName: string | null = null;
  private watchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private watchStabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStableStat: { size: number; mtimeMs: number } | null = null;
  private reloadAttemptTimestamps: number[] = [];
  private watcherDisabled = false;
  private isReloading = false;

  public componentDidMount() {
    this.loadRealm(
      this.props.realm,
      this.props.import ? this.props.import.schema : undefined
    ).then(() => this.startWatchingRealmFile());
    this.addListeners();
  }

  public componentWillUnmount() {
    super.componentWillUnmount();
    this.removeListeners();
    this.stopWatchingRealmFile();
    if (this.realm && this.realm.isInTransaction) {
      this.realm.cancelTransaction();
    }
  }

  public render() {
    const { focus } = this.state;
    // Generating a key for the content component (includes length of properties to update when the schema changes)
    const contentKey = generateKey(focus, true);
    return (
      <RealmBrowser
        classes={this.state.classes}
        contentKey={contentKey}
        contentRef={this.contentRef}
        dataVersion={this.state.dataVersion}
        dataVersionAtBeginning={this.state.dataVersionAtBeginning}
        allowCreate={this.state.allowCreate}
        editMode={this.props.readOnly ? EditMode.Disabled : this.state.editMode}
        focus={this.state.focus}
        getClassFocus={this.getClassFocus}
        getSchemaLength={this.getSchemaLength}
        importDialog={this.state.importDialog}
        jsonViewerDialog={this.state.jsonViewerDialog}
        isAddClassOpen={this.state.isAddClassOpen}
        isAddPropertyOpen={this.state.isAddPropertyOpen}
        isClassNameAvailable={this.isClassNameAvailable}
        isEncryptionDialogVisible={this.state.isEncryptionDialogVisible}
        isLeftSidebarOpen={this.state.isLeftSidebarOpen}
        isPropertyNameAvailable={this.isPropertyNameAvailable}
        onAddClass={this.onAddClass}
        onAddProperty={this.onAddProperty}
        onCancelTransaction={this.onCancelTransaction}
        onClassFocussed={this.onClassFocussed}
        onCommitTransaction={this.onCommitTransaction}
        onHideEncryptionDialog={this.onHideEncryptionDialog}
        onHideImportDialog={this.onHideImportDialog}
        onShowJsonViewerDialog={this.onShowJsonViewerDialog}
        onHideJsonViewerDialog={this.onHideJsonViewerDialog}
        onImport={this.handleImport}
        onLeftSidebarToggle={this.onLeftSidebarToggle}
        onListFocussed={this.onListFocussed}
        onSingleListFocussed={this.onSingleListFocussed}
        onOpenWithEncryption={this.onOpenWithEncryption}
        onRealmChanged={this.onRealmChanged}
        onReload={this.onManualReload}
        progress={this.state.progress}
        realm={this.realm}
        toggleAddClass={this.toggleAddClass}
        toggleAddClassProperty={this.toggleAddClassProperty}
        isEmbeddedType={this.isEmbeddedType}
      />
    );
  }

  public generateMenu(template: MenuItemConstructorOptions[]) {
    const importMenu: MenuItemConstructorOptions = {
      label: 'Import data from',
      submenu: [
        {
          label: 'CSV',
          click: () => this.onImportIntoExistingRealm()
        }
      ]
    };

    const exportSchemaMenu: MenuItemConstructorOptions = {
      label: 'Save model definitions',
      submenu: [
        {
          label: 'Swift',
          click: () => this.onExportSchema(Language.Swift)
        },
        {
          label: 'JavaScript',
          click: () => this.onExportSchema(Language.JS)
        },
        {
          label: 'TypeScript',
          click: () => this.onExportSchema(Language.TS)
        },
        {
          label: 'Java',
          click: () => this.onExportSchema(Language.Java)
        },
        {
          label: 'Kotlin',
          click: () => this.onExportSchema(Language.Kotlin)
        },
        {
          label: 'C#',
          click: () => this.onExportSchema(Language.CS)
        }
      ]
    };

    const exportDataMenu: MenuItemConstructorOptions = {
      label: 'Save data',
      submenu: [
        {
          label: 'JSON',
          click: () => this.onExportData(DataExportFormat.JSON)
        },
        {
          label: 'Local Realm',
          click: () => this.onExportData(DataExportFormat.LocalRealm)
        }
      ]
    };

    const transactionMenuItems: MenuItemConstructorOptions[] =
      this.realm && this.realm.isInTransaction
        ? [
            {
              label: 'Commit transaction',
              accelerator: 'CommandOrControl+T',
              click: () => {
                this.onCommitTransaction();
              }
            },
            {
              label: 'Cancel transaction',
              accelerator: 'CommandOrControl+Shift+T',
              click: () => {
                this.onCancelTransaction();
              }
            }
          ]
        : [
            {
              label: 'Begin transaction',
              accelerator: 'CommandOrControl+T',
              click: () => {
                this.onBeginTransaction();
              }
            }
          ];

    const editModeMenu: MenuItemConstructorOptions = {
      label: 'Edit mode',
      submenu: [
        {
          label: 'Update when leaving a field',
          type: 'radio',
          checked: this.state.editMode === EditMode.InputBlur,
          click: () => {
            this.onEditModeChange(EditMode.InputBlur);
          }
        },
        {
          label: 'Update on key press',
          type: 'radio',
          checked: this.state.editMode === EditMode.KeyPress,
          click: () => {
            this.onEditModeChange(EditMode.KeyPress);
          }
        }
      ]
    };

    const copyRealmPathItem: MenuItemConstructorOptions = {
      label: 'Copy local Realm path',
      click: () => {
        this.copyRealmPathToClipboard().then(null, (err) => {
          showError('Failed to copy Realm path', err);
        });
      }
    };

    return menu.performModifications(template, [
      {
        action: 'append',
        id: 'import',
        items: [importMenu]
      },
      {
        action: 'prepend',
        id: 'close',
        items: [
          exportSchemaMenu,
          exportDataMenu,
          copyRealmPathItem,
          { type: 'separator' }
        ]
      },
      {
        action: 'append',
        id: 'select-all',
        items: [{ type: 'separator' }, ...transactionMenuItems, editModeMenu]
      }
    ]);
  }

  protected loadingRealmFailed(err: Error) {
    const message = err.message || '';
    const mightBeEncrypted =
      message.includes('Not a Realm file.') ||
      message.includes('invalid mnemonic') ||
      message.includes('Realm file initial open failed');
    const realm = this.props.realm;
    if (mightBeEncrypted) {
      this.setState({
        isEncryptionDialogVisible: true,
        progress: {
          status: 'done'
        }
      });
    } else if (
      message === FILE_UPGRADE_NEEDED_MESSAGE &&
      realm.mode === realms.RealmLoadingMode.Local
    ) {
      const buttons = ['Cancel', 'Upgrade in-place', 'Backup and upgrade'];
      const answerIndex = remote.dialog.showMessageBoxSync({
        type: 'question',
        buttons,
        defaultId: 2,
        title: 'Realm file needs an upgrade',
        message: 'The Realm file stores data in an outdated format',
        detail:
          'This file needs to be upgraded to a newer file format before it can be opened. Would you like a backup of the file, before performing an irreversible upgrade of the file?'
      });
      const answer = buttons[answerIndex];

      if (answer === 'Upgrade in-place' || answer === 'Backup and upgrade') {
        try {
          if (answer === 'Backup and upgrade') {
            // Create a backup first
            const backupDirectory = path.dirname(realm.path);
            const backupFileName = path.basename(realm.path, '.realm');
            const backupPath = path.resolve(
              backupDirectory,
              backupFileName + '.backup.realm'
            );
            // Copy, but ensure we don't override an existing file
            fs.copyFileSync(realm.path, backupPath, fs.constants.COPYFILE_EXCL);
            remote.dialog.showMessageBox({
              title: 'Backup saved',
              message: 'The backup Realm file was saved to:',
              detail: backupPath
            });
          }
          // Reopen, enabling format upgrades an upgrade
          this.loadRealm({
            ...realm,
            enableFormatUpgrade: true
          });
        } catch (err) {
          showError('Failed upgrading Realm', err);
          window.close();
        }
      } else {
        window.close();
      }
    } else if (err.message === ARCHITECTURE_MISMATCH_MESSAGE) {
      const improvedError = new Error(
        'The file is already opened by another process, with an incompatible lock file format. Try up- or downgrading Realm Studio or SDK to match their versions of Realm Core.\n\nSee Realm Studio changelog on GitHub for details on compatibility between versions.'
      );
      showError('Failed to open Realm', improvedError);
      window.close();
    } else {
      delete this.props.realm.encryptionKey;
      super.loadingRealmFailed(err);
    }
  }

  protected onRealmChanged = () => {
    this.setState({ dataVersion: this.state.dataVersion + 1 });
  };

  protected onRealmSchemaChanged = () => {
    if (this.realm) {
      let { focus } = this.state;
      // Update the classes and derive properties for the active focus
      if (focus && focus.kind === 'class') {
        focus = this.getClassFocus(focus.className);
      } else if (focus && focus.kind === 'list') {
        focus = this.getListFocus(focus.parent, focus.property);
      } else if (focus && focus.kind === 'single-object') {
        focus = this.getSingleObjectFocus(focus.parent, focus.property);
      }
      this.setState({ classes: this.realm.schema, focus });
    }
  };

  protected onRealmLoaded = () => {
    if (!this.realm) {
      throw new Error('onRealmLoaded was called without a realm sat');
    }
    if (this.props.readOnly) {
      // Monkey-patch the write function to ensure no-one writes to the Realm
      this.realm.write = () => {
        throw new Error('Realm was opened as read-only');
      };
    }

    this.setState({
      classes: this.realm.schema
    });

    const firstSchemaName = this.realm.schema.find(
      (c) => c.name.indexOf('__') !== 0 && !c.embedded
    )?.name;

    if (firstSchemaName) {
      this.onClassFocussed(firstSchemaName);
    }
    // Start importing data if needed
    if (this.props.import && this.realm) {
      const { format, paths } = this.props.import;
      // Assume the schema class names were generated from the files basenames
      const files = paths.map((p) => ({
        path: p,
        className: path.basename(p)
      }));
      this.handleImport(format, files);
    }
  };

  private isEmbeddedType: IsEmbeddedTypeChecker = (
    className?: string
  ): boolean => {
    const { classes } = this.state;
    return classes.find((c) => c.name === className)?.embedded ?? false;
  };

  private isCreateAllowed = (focus?: Focus): boolean => {
    // Disallow creation on full embedded class list
    if (
      focus?.isEmbedded &&
      (focus.kind === 'class' || focus.kind === 'single-object')
    ) {
      return false;
    }

    return true;
  };

  private onBeginTransaction = () => {
    if (this.realm && !this.realm.isInTransaction) {
      this.realm.beginTransaction();
      // Ask the menu to update
      this.props.updateMenu();
      // Hang on to the dataVersion
      this.setState({
        dataVersionAtBeginning: this.state.dataVersion
      });
    } else {
      throw new Error(`Realm is not ready or already in transaction`);
    }
  };

  private onCommitTransaction = () => {
    if (this.realm && this.realm.isInTransaction) {
      this.realm.commitTransaction();
      this.props.updateMenu();
      this.resetDataVersion();
    } else {
      throw new Error('Cannot commit when not in a transaction');
    }
  };

  private onCancelTransaction = () => {
    if (this.realm && this.realm.isInTransaction) {
      this.realm.cancelTransaction();
      this.props.updateMenu();
      this.resetDataVersion();
    } else {
      throw new Error('Cannot cancel when not in a transaction');
    }
  };

  private isClassNameAvailable = (name: string): boolean => {
    return !this.state.classes.find((schema) => schema.name === name);
  };

  private toggleAddClass = () => {
    this.setState({
      isAddClassOpen: !this.state.isAddClassOpen
    });
  };

  private isPropertyNameAvailable = (name: string): boolean => {
    return (
      this.state.focus !== null &&
      !this.state.focus.properties.find((property) => property.name === name)
    );
  };

  private toggleAddClassProperty = () => {
    this.setState({
      isAddPropertyOpen: !this.state.isAddPropertyOpen
    });
  };

  private onAddClass = async (schema: Realm.ObjectSchema) => {
    if (this.realm) {
      try {
        // The schema version needs to be bumped for local realms
        const nextSchemaVersion = this.realm.schemaVersion + 1;
        const modifiedSchema = [...this.state.classes, schema];
        // Close the current Realm
        this.realm.close();
        // Deleting the object to indicate we've closed it
        delete this.realm;
        // Clear the focus until the realm is re-loaded
        this.setState({ focus: null });
        // Load it again with the new schema
        await this.loadRealm(
          this.props.realm,
          modifiedSchema,
          nextSchemaVersion
        );
        // Select the schema when it the realm has loaded
        this.onClassFocussed(schema.name);
      } catch (err) {
        showError(`Failed creating the model "${schema.name}"`, err);
      }
    }
  };

  private onAddProperty = async (name: string, type: string) => {
    if (this.realm && this.state.focus && this.state.focus.kind === 'class') {
      try {
        const focusedClassName = this.state.focus.className;
        const nextSchemaVersion = this.realm.schemaVersion + 1;
        const modifiedSchema = schemaUtils.addProperty(
          this.state.classes,
          this.state.focus.className,
          name,
          type
        );
        // Close the current Realm
        this.realm.close();
        // Deleting the object to indicate we've closed it
        delete this.realm;
        // Clear the focus until the realm is re-loaded
        this.setState({ focus: null });
        // Load it again with the new schema
        await this.loadRealm(
          this.props.realm,
          modifiedSchema,
          nextSchemaVersion
        );
        // Ensure we've selected the class that we've just added a property to
        this.onClassFocussed(focusedClassName);
      } catch (err) {
        showError(
          `Failed adding the property named "${name}" to the selected schema`,
          err
        );
      }
    }
  };

  private changeFocusIfAllowed(focus: Focus, highlightedObject?: Realm.Object) {
    const canChangeFocus = this.canChangeFocus();
    if (canChangeFocus) {
      const allowCreate = this.isCreateAllowed(focus);
      this.setState({ focus, allowCreate }, () => {
        if (highlightedObject && this.contentInstance) {
          this.contentInstance.highlightObject(highlightedObject);
        }
      });
    }
  }

  private onClassFocussed: ClassFocussedHandler = (
    className,
    highlightedObject
  ) => {
    const focus = this.getClassFocus(className);
    this.changeFocusIfAllowed(focus, highlightedObject);
  };

  private onListFocussed: ListFocussedHandler = (
    object: Realm.Object,
    property: IPropertyWithName,
    highlightedObject?: Realm.Object
  ) => {
    const focus = this.getListFocus(object, property);
    this.changeFocusIfAllowed(focus, highlightedObject);
  };

  private onSingleListFocussed: SingleListFocussedHandler = (
    object: Realm.Object,
    property: IPropertyWithName
  ) => {
    const focus = this.getSingleObjectFocus(object, property);
    this.changeFocusIfAllowed(focus);
  };

  private getClassFocus = (className: string): IClassFocus | any => {
    if (this.realm) {
      const schema = this.realm.schema.find((s) => s.name === className);

      return {
        kind: 'class',
        className,
        results:
          schema?.asymmetric || schema?.embedded
            ? new MockedObjectCollection(schema)
            : this.realm.objects(className),
        properties: this.derivePropertiesFromClassName(className),
        isEmbedded: this.isEmbeddedType(className)
      };
    } else {
      throw new Error('getClassFocus called before realm was loaded');
    }
  };

  private getSingleObjectFocus = (
    object: Realm.Object & { [name: string]: any },
    property: IPropertyWithName
  ): ISingleObjectFocus => {
    if (property.name && property.objectType) {
      return {
        kind: 'single-object',
        parent: object,
        property,
        results: new SingleObjectCollection(object[property.name]),
        properties: this.derivePropertiesFromClassName(property.objectType),
        isEmbedded: property.isEmbedded ?? false
      };
    } else {
      throw new Error('Expected a property with a name & objectType property');
    }
  };

  private getListFocus = (
    // `{ [name: string]: any }` because of Realm JS types
    object: Realm.Object & { [name: string]: any },
    property: IPropertyWithName
  ): IListFocus => {
    if (property.name) {
      const common = {
        parent: object,
        property,
        properties: this.derivePropertiesFromProperty(property),
        results: object[property.name],
        isEmbedded: this.isEmbeddedType(property.objectType)
      };
      if (property.objectType && isPrimitive(property.objectType)) {
        return {
          ...common,
          kind: 'list',
          ofPrimitives: true
        };
      } else {
        return {
          ...common,
          kind: 'list',
          ofPrimitives: false
        };
      }
    } else {
      throw new Error('Expected a property with a name property');
    }
  };

  private getSchemaLength = (name: string) => {
    if (this.realm) {
      const schema = this.realm.schema.find((s) => s.name === name);
      return schema?.asymmetric ? 0 : this.realm.objects(name).length;
    } else {
      return 0;
    }
  };

  private onEditModeChange: EditModeChangeHandler = (editMode) => {
    localStorage.setItem(EDIT_MODE_STORAGE_KEY, editMode);
    this.setState({ editMode });
  };

  private onHideEncryptionDialog = () => {
    this.setState({ isEncryptionDialogVisible: false });
  };

  private onHideImportDialog = () => {
    this.setState({ importDialog: null });
  };

  private onShowJsonViewerDialog = (value: unknown) => {
    this.setState({ jsonViewerDialog: { value } });
  };

  private onHideJsonViewerDialog = () => {
    this.setState({ jsonViewerDialog: null });
  };

  private onLeftSidebarToggle = () => {
    this.setState({ isLeftSidebarOpen: !this.state.isLeftSidebarOpen });
  };

  private onOpenWithEncryption = (key: string) => {
    this.props.realm.encryptionKey = Buffer.from(key, 'hex');
    this.loadRealm(this.props.realm).then(() => this.startWatchingRealmFile());
  };

  private onManualReload = () => {
    // A manual reload is also a vote of confidence that we should resume
    // watching: clear the attempt counter and re-enable the watcher in case
    // it was previously disabled by the rate limiter.
    this.reloadAttemptTimestamps = [];
    this.watcherDisabled = false;
    void this.reloadFromDisk();
  };

  private reloadFromDisk = async () => {
    if (this.isReloading) {
      return;
    }
    if (this.props.realm.mode !== realms.RealmLoadingMode.Local) {
      return;
    }
    this.isReloading = true;
    this.stopWatchingRealmFile();

    // Keep a reference to the realm we are about to discard. We must NOT call
    // realm.close() until React has fully committed a render in which no
    // Realm-bound objects remain in the tree. Otherwise React 19's passive
    // effects / devtools profiling pass walks the previous render's props
    // (e.g. focus.results, which is a Realm.Results) and trips the SDK's
    // "Accessing object which has been invalidated or deleted" assertion
    // mid-commit, which permanently wedges the reconciler.
    const closingRealm = this.realm;

    // Detach listeners first so a late change/schema notification fired during
    // the close handshake cannot land in React state that references the
    // closing realm.
    if (closingRealm) {
      try {
        closingRealm.removeListener('change', this.onRealmChanged);
        closingRealm.removeListener('schema', this.onRealmSchemaChanged);
      } catch {
        // ignore
      }
    }

    // Hide the realm from render() before flushing, so <Content> unmounts and
    // the sidebar drops its schema references.
    this.realm = undefined;

    flushSync(() => {
      this.setState({
        focus: null,
        classes: [],
        progress: { status: 'in-progress' },
        dataVersion: 0,
        dataVersionAtBeginning: undefined
      });
    });

    // At this point Content (and any other consumer of Realm objects) has
    // unmounted and its passive effects have run with the realm still valid.
    // Releasing the native resources is now safe.
    if (closingRealm) {
      if (closingRealm.isInTransaction) {
        try {
          closingRealm.cancelTransaction();
        } catch {
          // ignore
        }
      }
      try {
        closingRealm.close();
      } catch {
        // ignore
      }
    }

    try {
      await this.loadRealm(
        this.props.realm,
        this.props.import ? this.props.import.schema : undefined
      );
    } finally {
      this.startWatchingRealmFile();
      this.isReloading = false;
    }
  };

  // Watcher tuning constants. The debounce + stability window together let
  // the other process finish its write (and release its lock) before we try
  // to reopen, which is what prevents `new Realm()` from blocking the event
  // loop on lock contention.
  private static readonly WATCH_DEBOUNCE_MS = 750;
  private static readonly WATCH_STABILITY_POLL_MS = 500;
  private static readonly WATCH_MAX_STABILITY_POLLS = 20; // 10s ceiling
  private static readonly RELOAD_ATTEMPT_WINDOW_MS = 30000;
  private static readonly RELOAD_ATTEMPT_MAX = 5;

  private startWatchingRealmFile() {
    const realm = this.props.realm;
    if (!realm || realm.mode !== realms.RealmLoadingMode.Local) {
      return;
    }
    if (this.watcherDisabled) {
      return;
    }
    const realmPath = realm.path;
    this.stopWatchingRealmFile();
    try {
      const stat = fs.statSync(realmPath);
      this.watchedInode = stat.ino;
      this.watchedMtimeMs = stat.mtimeMs;
      this.watchedSize = stat.size;
    } catch {
      this.watchedInode = null;
      this.watchedMtimeMs = null;
      this.watchedSize = null;
    }
    const dir = path.dirname(realmPath);
    this.watchedFileName = path.basename(realmPath);
    try {
      this.fileWatcher = fs.watch(dir, (_event, changed) => {
        if (!changed || changed !== this.watchedFileName) {
          return;
        }
        if (this.watchDebounceTimer) {
          clearTimeout(this.watchDebounceTimer);
        }
        this.watchDebounceTimer = setTimeout(() => {
          this.watchDebounceTimer = null;
          this.handleWatchedFileEvent();
        }, RealmBrowserContainer.WATCH_DEBOUNCE_MS);
      });
    } catch {
      // Watching is best-effort; the manual refresh button remains as a fallback.
      this.fileWatcher = null;
    }
  }

  private stopWatchingRealmFile() {
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }
    if (this.watchStabilityTimer) {
      clearTimeout(this.watchStabilityTimer);
      this.watchStabilityTimer = null;
    }
    if (this.fileWatcher) {
      try {
        this.fileWatcher.close();
      } catch {
        // ignore
      }
      this.fileWatcher = null;
    }
    this.watchedInode = null;
    this.watchedMtimeMs = null;
    this.watchedSize = null;
    this.watchedFileName = null;
    this.lastStableStat = null;
  }

  private handleWatchedFileEvent() {
    const realm = this.props.realm;
    if (
      !realm ||
      realm.mode !== realms.RealmLoadingMode.Local ||
      this.isReloading
    ) {
      return;
    }
    const realmPath = realm.path;
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(realmPath);
    } catch {
      // File does not currently exist on disk — keep the current view
      // (matches existing behavior when a file is only deleted).
      return;
    }
    // Inode change = file was replaced (atomic rename / delete+recreate).
    // mtime or size change = another process wrote in-place to the same file.
    const inodeChanged =
      this.watchedInode !== null && stat.ino !== this.watchedInode;
    const mtimeChanged =
      this.watchedMtimeMs !== null && stat.mtimeMs !== this.watchedMtimeMs;
    const sizeChanged =
      this.watchedSize !== null && stat.size !== this.watchedSize;
    if (!(inodeChanged || mtimeChanged || sizeChanged)) {
      return;
    }
    // Wait for the file to stop changing before triggering reload. Reopening
    // mid-write is the case where Realm SDK's lock acquisition tends to
    // block the entire renderer event loop, so we pay the cost of a short
    // poll here to avoid that.
    this.lastStableStat = { size: stat.size, mtimeMs: stat.mtimeMs };
    this.waitForFileStability(0);
  }

  private waitForFileStability(pollsSoFar: number) {
    if (this.watchStabilityTimer) {
      clearTimeout(this.watchStabilityTimer);
      this.watchStabilityTimer = null;
    }
    this.watchStabilityTimer = setTimeout(() => {
      this.watchStabilityTimer = null;
      const realm = this.props.realm;
      if (
        !realm ||
        realm.mode !== realms.RealmLoadingMode.Local ||
        this.isReloading ||
        this.watcherDisabled
      ) {
        return;
      }
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(realm.path);
      } catch {
        return;
      }
      const prev = this.lastStableStat;
      if (prev && prev.size === stat.size && prev.mtimeMs === stat.mtimeMs) {
        // File has been quiet for one full poll interval. Safe to reload.
        this.lastStableStat = null;
        if (this.recordAndCheckReloadAttempt()) {
          void this.reloadFromDisk();
        }
        return;
      }
      this.lastStableStat = { size: stat.size, mtimeMs: stat.mtimeMs };
      if (pollsSoFar + 1 >= RealmBrowserContainer.WATCH_MAX_STABILITY_POLLS) {
        // Other process is writing continuously — give up this round; the
        // next fs.watch event will restart the cycle.
        this.lastStableStat = null;
        return;
      }
      this.waitForFileStability(pollsSoFar + 1);
    }, RealmBrowserContainer.WATCH_STABILITY_POLL_MS);
  }

  private recordAndCheckReloadAttempt(): boolean {
    const now = Date.now();
    const cutoff = now - RealmBrowserContainer.RELOAD_ATTEMPT_WINDOW_MS;
    this.reloadAttemptTimestamps = this.reloadAttemptTimestamps.filter(
      (t) => t >= cutoff
    );
    if (
      this.reloadAttemptTimestamps.length >=
      RealmBrowserContainer.RELOAD_ATTEMPT_MAX
    ) {
      // Too many auto-reloads in a short window — back off completely. The
      // user can still trigger a manual reload via the sidebar button.
      this.watcherDisabled = true;
      this.stopWatchingRealmFile();
      console.warn(
        `Realm file changed >= ${RealmBrowserContainer.RELOAD_ATTEMPT_MAX} times ` +
          `in ${RealmBrowserContainer.RELOAD_ATTEMPT_WINDOW_MS / 1000}s; ` +
          `disabling auto-reload. Use the reload button to retry.`
      );
      return false;
    }
    this.reloadAttemptTimestamps.push(now);
    return true;
  }

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.realm && this.realm.isInTransaction) {
      e.returnValue = false;

      const { dataVersionAtBeginning, dataVersion } = this.state;
      const unsavedChanges =
        typeof dataVersionAtBeginning === 'number'
          ? dataVersion - dataVersionAtBeginning
          : 0;
      // Show a dialog
      const currentWindow = remote.getCurrentWindow();
      const plural = unsavedChanges > 1 ? 's' : '';
      remote.dialog
        .showMessageBox(currentWindow, {
          type: 'warning',
          message: `You have ${unsavedChanges} unsaved change${plural}`,
          buttons: ['Save and close', 'Discard and close', 'Cancel']
        })
        .then(({ response }) => {
          if (response === 0 || response === 1) {
            if (response === 0) {
              this.onCommitTransaction();
            } else if (response === 1) {
              this.onCancelTransaction();
            }
            // Allow the for the state to update
            process.nextTick(() => {
              window.close();
            });
          }
        });
    }
  };

  private onExportSchemaIpc = (_event: unknown, language: Language) =>
    this.onExportSchema(language);

  private addListeners() {
    ipcRenderer.addListener('export-schema', this.onExportSchemaIpc);
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  private removeListeners() {
    ipcRenderer.removeListener('export-schema', this.onExportSchemaIpc);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  private derivePropertiesFromProperty(
    property: IPropertyWithName
  ): IPropertyWithName[] {
    // Determine the properties
    if (property.objectType) {
      if (property.type === 'list') {
        const properties: IPropertyWithName[] = [
          { name: '#', type: 'int', readOnly: true, isPrimaryKey: false }
        ];
        if (isPrimitive(property.objectType)) {
          return properties.concat([
            {
              name: null,
              type: property.objectType,
              readOnly: false,
              isPrimaryKey: false
            }
          ]);
        } else {
          return properties.concat(
            this.derivePropertiesFromClassName(property.objectType)
          );
        }
      }

      if (property.type === 'object' && property.isEmbedded) {
        return this.derivePropertiesFromClassName(property.objectType);
      }

      throw new Error('Expected a list or embedded object');
    } else {
      throw new Error('Expected a list property with an objectType');
    }
  }

  private derivePropertiesFromClassName(
    className: string
  ): IPropertyWithName[] {
    if (!this.realm) {
      throw new Error(
        'derivePropertiesFromClassName called before realm was loaded'
      );
    }
    // Deriving the ObjectSchema from the className
    const objectSchema = this.realm.schema.find((schema) => {
      return schema.name === className;
    });
    if (!objectSchema) {
      throw new Error(`Found no object schema named '${className}'`);
    }
    // Derive the properties from the objectSchema
    return Object.keys(objectSchema.properties).map((propertyName) => {
      const property = objectSchema.properties[
        propertyName
      ] as Realm.ObjectSchemaProperty;
      if (typeof property === 'object') {
        const isEmbedded =
          !!property.objectType && this.isEmbeddedType(property.objectType);

        return {
          name: propertyName,
          readOnly: false,
          isEmbedded,
          isPrimaryKey: objectSchema.primaryKey === propertyName,
          ...property
        };
      } else {
        throw new Error(`Object schema had a string describing its property`);
      }
    });
  }

  private resetDataVersion() {
    if (typeof this.state.dataVersionAtBeginning === 'number') {
      this.setState({
        dataVersion: this.state.dataVersionAtBeginning,
        dataVersionAtBeginning: undefined
      });
    }
  }

  private canChangeFocus() {
    if (this.contentInstance) {
      const { latestCellValidation } = this.contentInstance;
      return !latestCellValidation || latestCellValidation.valid;
    } else {
      return true;
    }
  }

  private contentRef = (instance: Content | null) => {
    this.contentInstance = instance;
  };

  private onExportSchema = (language: Language): void => {
    if (!this.realm) {
      throw new Error('Expected a loaded Realm');
    }
    const basename = path.basename(this.realm.path, '.realm');
    const selectedPath = remote.dialog.showSaveDialogSync({
      defaultPath: `${basename}-classes`,
      message: `Select a directory to store the ${language} schema files`
    });
    if (selectedPath && this.realm) {
      const exporter = SchemaExporter(language);
      exporter.exportSchema(this.realm);
      exporter.writeFilesToDisk(selectedPath);
    }
  };

  private onExportData = (format: DataExportFormat) => {
    try {
      const exporter = new DataExporter(format);
      if (this.realm) {
        const destinationPath = remote.dialog.showSaveDialogSync({
          defaultPath: exporter.suggestFilename(this.realm),
          message: 'Select a destination for the data'
        });
        if (destinationPath) {
          exporter.export(this.realm, destinationPath);
        }
      } else {
        throw new Error('Realm is not open');
      }
    } catch (err) {
      showError('Failed to export data', err);
    }
  };

  private onImportIntoExistingRealm = (
    format: dataImporter.ImportFormat = dataImporter.ImportFormat.CSV
  ) => {
    const paths = dataImporter.showOpenDialog(format);
    if (this.realm && paths && paths.length > 0) {
      const classNames = this.realm.schema.map((s) => s.name);
      this.setState({ importDialog: { filePaths: paths, classNames } });
    }
  };

  private handleImport = (
    format: dataImporter.ImportFormat,
    files: dataImporter.ImportableFile[]
  ) => {
    if (this.realm) {
      this.setState({ progress: { status: 'in-progress' } });
      // Get the importer
      try {
        const importer = dataImporter.getDataImporter(format);
        importer.import(this.realm, files);
      } catch (err) {
        showError('Failed to import data', err);
      } finally {
        this.setState({ progress: { status: 'done' } });
      }
    }
  };

  private async copyRealmPathToClipboard(): Promise<void> {
    if (this.realm) {
      await navigator.clipboard.writeText(this.realm.path);
    } else {
      throw new Error('Realm was not loaded');
    }
  }
}

export { RealmBrowserContainer as RealmBrowser };
