/* exported DesktopManager */
/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const ByteArray = imports.byteArray;

const FileItem = imports.fileItem;
const DesktopGrid = imports.desktopGrid;
const DesktopIconsUtil = imports.desktopIconsUtil;
const Prefs = imports.preferences;
const Enums = imports.enums;
const SortUtil = imports.sortUtil;
const DBusUtils = imports.dbusUtils;
const AskConfirmPopup = imports.askConfirmPopup;
const ShowErrorPopup = imports.showErrorPopup;
const TemplateManager = imports.templateManager;
const Constants = imports.constants;
const SelectionCalculator = imports.selectionCalculator;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var DesktopManager = class {
    constructor(desktopList, codePath, asDesktop, primaryIndex) {
        DBusUtils.init();
        this._premultiplied = false;
        try {
            for (let f of Prefs.mutterSettings.get_strv('experimental-features')) {
                if (f === 'scale-monitor-framebuffer') {
                    this._premultiplied = true;
                    break;
                }
            }
        } catch (e) {
        }
        this._primaryIndex = primaryIndex;
        this._primaryScreen = desktopList[primaryIndex];
        this._clickX = 0;
        this._clickY = 0;
        this._dragList = null;
        this.dragItem = null;
        this._templateManager = new TemplateManager.TemplateManager();
        this._codePath = codePath;
        this._asDesktop = asDesktop;
        this._desktopList = desktopList;
        this._desktops = [];
        this._desktopFilesChanged = false;
        this._readingDesktopFiles = true;
        this._scriptFilesChanged = false;
        this._deletingFilesRecursively = false;
        this._toDelete = [];
        this._fileList = [];
        this._createdFileName = null;
        this._renamedFileName = null;
        this._initDesktop();
        this._scriptsDir = DesktopIconsUtil.getScriptsDir();
        this._monitorScriptDir = this._scriptsDir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorScriptDir.set_rate_limit(1000);
        this._monitorScriptDir.connect('changed', (unusedObj, unusedFile, unusedOtherFile, unusedEventType) => this._updateScriptFileList());
        this._showHidden = Prefs.gtkSettings.get_boolean('show-hidden');
        this.showDropPlace = Prefs.desktopSettings.get_boolean('show-drop-place');
        this._settingsId = Prefs.desktopSettings.connect('changed', (obj, key) => {
            if (key === 'icon-size') {
                this._removeAllFilesFromGrids();
                this._createGrids();
            }
            this.showDropPlace = Prefs.desktopSettings.get_boolean('show-drop-place');
            this.desktopFileTrusted = Prefs.desktopSettings.get_boolean('allow-desktop-file-launching');
            this._updateDesktop();
        });
        Prefs.gtkSettings.connect('changed', (obj, key) => {
            if (key === 'show-hidden') {
                this._showHidden = Prefs.gtkSettings.get_boolean('show-hidden');
                this._updateDesktop();
            }
        });
        Prefs.fileManagerSettings.connect('changed', (obj, key) => {
            if (key === 'show-image-thumbnails')
                this._updateDesktop();

        });
        this._gtkIconTheme = Gtk.IconTheme.get_default();
        this._gtkIconTheme.connect('changed', () => {
            this._updateDesktop();
        });
        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._volumeMonitor.connect('mount-added', () => {
            this._updateDesktop();
        });
        this._volumeMonitor.connect('mount-removed', () => {
            this._updateDesktop();
        });

        this.rubberBand = false;

        this.desktopFileTrusted = Prefs.desktopSettings.get_boolean('allow-desktop-file-launching');
        let cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_file(Gio.File.new_for_path(GLib.build_filenamev([codePath, 'stylesheet.css'])));
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), cssProvider, 600);

        this._configureSelectionColor();
        this._createDesktopBackgroundMenu();
        this._createGrids();

        DBusUtils.FileOperationsProxy.connect('g-properties-changed', this._undoStatusChanged.bind(this));
        this._readFileList();

        this._scriptsList = [];
        this._readScriptFileList();
        this._selectionCalculator = new SelectionCalculator.SelectionCalculator();

        // Check if File Manager is available
        try {
            let currentFileManager = Constants.isFileManagerNemo ? 'nemo' : 'nautilus';
            DesktopIconsUtil.trySpawn(null, [currentFileManager, '--version']);
        } catch (e) {
            this._errorWindow = new ShowErrorPopup.ShowErrorPopup(_('File Manager not found'),
                _('Nemo or Nautilus File Manager is mandatory to work with Desktop Icons NG.'),
                null,
                true);
        }
        this._pendingDropFiles = {};
        if (this._asDesktop) {
            this._sigtermID = GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 15, () => {
                GLib.source_remove(this._sigtermID);
                for (let desktop of this._desktops)
                    desktop.destroy();

                Gtk.main_quit();
                return false;
            });
        }
    }

    _initDesktop() {
        this._desktopDir = this._getDesktopDir();
        this.desktopFsId = this._desktopDir.query_info('id::filesystem',
            Gio.FileQueryInfoFlags.NONE, null).get_attribute_string('id::filesystem');
        this._updateWritableByOthers();
        this._monitorDesktopDir = this._desktopDir.monitor_directory(
            Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorDesktopDir.set_rate_limit(1000);
        this._monitorDesktopDir.connect('changed', (obj, file, otherFile, eventType) =>
            this._updateDesktopIfChanged(file, otherFile, eventType));

        this._removeAllFilesFromGrids();
    }

    _getDesktopDir() {
        let [success, res] = GLib.spawn_command_line_sync('xdg-user-dir DESKTOP');

        // When we failed to call 'xdg' directly, we use GLib function.
        let desktopPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);

        if (success)
            desktopPath = ByteArray.toString(res).split('\n')[0];


        return Gio.File.new_for_commandline_arg(desktopPath);
    }

    _createGrids() {
        for (let desktop of this._desktops)
            desktop.destroy();

        this._desktops = [];
        for (let desktopIndex in this._desktopList) {
            let desktop = this._desktopList[desktopIndex];
            var desktopName;
            if (this._asDesktop)
                desktopName = `@!${desktop.x},${desktop.y};BDH`;
            else
                desktopName = `DING ${desktopIndex}`;

            this._desktops.push(new DesktopGrid.DesktopGrid(this, desktopName, desktop, this._asDesktop, this._premultiplied));
        }
    }

    _configureSelectionColor() {
        this._contextWidget = new Gtk.WidgetPath();
        this._contextWidget.append_type(Gtk.Widget);

        this._styleContext = new Gtk.StyleContext();
        this._styleContext.set_path(this._contextWidget);
        this._styleContext.add_class('view');
        this._cssProviderSelection = new Gtk.CssProvider();
        this._styleContext.connect('changed', () => {
            Gtk.StyleContext.remove_provider_for_screen(Gdk.Screen.get_default(), this._cssProviderSelection);
            this._setSelectionColor();
        });
        this._setSelectionColor();
    }

    _setSelectionColor() {
        this.selectColor = this._styleContext.get_background_color(Gtk.StateFlags.SELECTED);
        let style = `.desktop-icons-selected {
            background-color: rgba(${this.selectColor.red * 255},${this.selectColor.green * 255}, ${this.selectColor.blue * 255}, 0.6);
        }`;
        this._cssProviderSelection.load_from_data(style);
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), this._cssProviderSelection, 600);
    }

    clearFileCoordinates(fileList, dropCoordinates) {
        for (let element of fileList) {
            let file = Gio.File.new_for_uri(element);
            if (!file.is_native() || !file.query_exists(null)) {
                if (dropCoordinates !== null)
                    this._pendingDropFiles[file.get_basename()] = dropCoordinates;

                continue;
            }
            let info = new Gio.FileInfo();
            info.set_attribute_string(Constants.ICON_POSITION_METADATA, '');
            if (dropCoordinates !== null)
                info.set_attribute_string(Constants.DND_POSITION_METADATA, `${dropCoordinates[0]},${dropCoordinates[1]}`);

            try {
                file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
            } catch (e) {}
        }
    }

    doMoveWithDragAndDrop(xOrigin, yOrigin, xDestination, yDestination) {
        // Find the grid where the destination lies
        for (let desktop of this._desktops) {
            let grid = desktop.getGridAt(xDestination, yDestination, true);
            if (grid !== null) {
                xDestination = grid[0];
                yDestination = grid[1];
                break;
            }
        }
        let deltaX = xDestination - xOrigin;
        let deltaY = yDestination - yOrigin;
        let fileItems = [];
        for (let item of this._fileList) {
            if (item.isSelected) {
                fileItems.push(item);
                item.removeFromGrid();
                let [x, y, a_, b_, c_] = item.getCoordinates();
                item.savedCoordinates = [x + deltaX, y + deltaY];
            }
        }
        // force to store the new coordinates
        this._addFilesToDesktop(fileItems, Enums.StoredCoordinates.OVERWRITE);
    }

    onDragBegin(item) {
        this.dragItem = item;
    }

    onDragMotion(x, y) {
        if (this.dragItem === null) {
            for (let desktop of this._desktops)
                desktop.refreshDrag([[0, 0]], x, y);

            return;
        }
        if (this._dragList === null) {
            let itemList = this.getCurrentSelection(false);
            if (!itemList)
                return;

            let [x1, y1, x2_, y2_, c_] = this.dragItem.getCoordinates();
            let oX = x1;
            let oY = y1;
            this._dragList = [];
            for (let item of itemList) {
                [x1, y1, x2_, y2_, c_] = item.getCoordinates();
                this._dragList.push([x1 - oX, y1 - oY]);
            }
        }
        for (let desktop of this._desktops)
            desktop.refreshDrag(this._dragList, x, y);

    }

    onDragLeave() {
        this._dragList = null;
        for (let desktop of this._desktops)
            desktop.refreshDrag(null, 0, 0);

    }

    onDragEnd() {
        this.dragItem = null;
    }

    onDragDataReceived(xDestination, yDestination, selection, info) {
        this.onDragLeave();
        let fileList = DesktopIconsUtil.getFilesFromFileManagerDnD(selection, info);
        switch (info) {
        case 0:
            if (fileList.length !== 0) {
                let [xOrigin, yOrigin, a_, b_, c_] = this.dragItem.getCoordinates();
                this.doMoveWithDragAndDrop(xOrigin, yOrigin, xDestination, yDestination);
            }
            break;
        case 1:
        case 2:
            if (fileList.length !== 0) {
                for (let item of this._fileList)
                    item.unsetSelected();
                this.clearFileCoordinates(fileList, [xDestination, yDestination]);
                let data = Gio.File.new_for_uri(fileList[0]).query_info('id::filesystem', Gio.FileQueryInfoFlags.NONE, null);
                let idFs = data.get_attribute_string('id::filesystem');
                if (this.desktopFsId === idFs) {
                    DBusUtils.FileOperationsProxy.MoveURIsRemote(
                        fileList,
                        `file://${GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP)}`,
                        (result, error) => {
                            if (error)
                                throw new Error(`Error moving files: ${error.message}`);
                        }
                    );
                } else {
                    DBusUtils.FileOperationsProxy.CopyURIsRemote(
                        fileList,
                        `file://${GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP)}`,
                        (result, error) => {
                            if (error)
                                throw new Error(`Error moving files: ${error.message}`);
                        }
                    );
                }
            }
            break;
        case 3:
            if (fileList.length !== 0) {
                let dropCoordinates = [xDestination, yDestination];
                this.detectURLorText(fileList, dropCoordinates);
            }
            break;
        }
    }

    detectURLorText(fileList, dropCoordinates) {
        function isValidURL(str) {
            var pattern = new RegExp('^(https|http|ftp|rtsp|mms)?:\\/\\/?' +
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
            '((\\d{1,3}\\.){3}\\d{1,3}))' +
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
            '(\\?[;&a-z\\d%_.~+=-]*)?' +
            '(\\#[-a-z\\d_]*)?$', 'i');
            return !!pattern.test(str);
        }
        let text = fileList.toString();
        if (isValidURL(text)) {
            this.writeURLlinktoDesktop(text, dropCoordinates);
        } else {
            let filename = 'Dragged Text';
            let now = Date().valueOf().split(' ').join('').replace(/:/g, '-');
            filename = `${filename}-${now}`;
            DesktopIconsUtil.writeTextFileToDesktop(text, filename, dropCoordinates);
        }
    }

    writeURLlinktoDesktop(link, dropCoordinates) {
        let filename = link.split('?')[0];
        filename = filename.split('//')[1];
        filename = filename.split('/')[0];
        let now = Date().valueOf().split(' ').join('').replace(/:/g, '-');
        filename = `${filename}-${now}`;
        this.writeHTMLTypeLink(filename, link, dropCoordinates);
    }


    writeHTMLTypeLink(filename, link, dropCoordinates) {
        filename += '.html';
        let body = ['<html>', '<head>', `<meta http-equiv="refresh" content="0; url=${link}" />`, '</head>', '<body>', '</body>', '</html>'];
        body = body.join('\n');
        DesktopIconsUtil.writeTextFileToDesktop(body, filename, dropCoordinates);
    }

    fillDragDataGet(info) {
        let fileList = this.getCurrentSelection(false);
        if (fileList === null)
            return null;

        let atom;
        switch (info) {
        case 0:
            atom = Gdk.atom_intern('x-special/ding-icon-list', false);
            break;
        case 1:
            atom = Gdk.atom_intern('x-special/gnome-icon-list', false);
            break;
        case 2:
            atom = Gdk.atom_intern('text/uri-list', false);
            break;
        default:
            return null;
        }
        let data = '';
        for (let fileItem of fileList) {
            data += fileItem.uri;
            if (info === 1) {
                let coordinates = fileItem.getCoordinates();
                if (coordinates !== null)
                    data += `\r${coordinates[0]}:${coordinates[1]}:${coordinates[2] - coordinates[0] + 1}:${coordinates[3] - coordinates[1] + 1}`;

            }
            data += '\r\n';
        }
        return [atom, data];
    }

    onPressButton(x, y, event, unusedGrid) {
        let renamingItem = this.getRenaming();
        if (renamingItem)
            renamingItem.finishRename();

        this._clickX = Math.floor(x);
        this._clickY = Math.floor(y);
        let button = event.get_button()[1];
        let state = event.get_state()[1];
        if (button === 1) {
            let shiftPressed = !!(state & Gdk.ModifierType.SHIFT_MASK);
            let controlPressed = !!(state & Gdk.ModifierType.CONTROL_MASK);
            if (!shiftPressed && !controlPressed) {
                // clear selection
                for (let item of this._fileList)
                    item.unsetSelected();

            }
            this._startRubberband(x, y);
        }
        if (button === 3) {
            let templates = this._templateManager.getTemplates();
            if (templates.length === 0) {
                this._newDocumentItem.hide();
            } else {
                let templateMenu = new Gtk.Menu();
                this._newDocumentItem.set_submenu(templateMenu);
                for (let template of templates) {
                    let box = new Gtk.Box({ 'orientation': Gtk.Orientation.HORIZONTAL, 'spacing': 6 });
                    let icon = Gtk.Image.new_from_gicon(template['icon'], Gtk.IconSize.MENU);
                    let text = new Gtk.Label({ 'label': template['name'] });
                    box.add(icon);
                    box.add(text);
                    let entry = new Gtk.MenuItem({ 'label': template['name'] });
                    // entry.add(box);
                    templateMenu.add(entry);
                    entry.connect('activate', () => {
                        this._newDocument(template);
                    });
                }
                this._newDocumentItem.show_all();
            }
            this._syncUndoRedo();
            this._setMenuSensitivity();
            this._menu.popup_at_pointer(event);
        }
    }

    _setMenuSensitivity() {
        let atom = Gdk.Atom.intern('CLIPBOARD', false);
        let clipboard = Gtk.Clipboard.get(atom);

        if (Constants.isFileManagerNemo) {
            let nemoCustomAtom = Gdk.Atom.intern('x-special/gnome-copied-files', false);
            clipboard.request_contents(nemoCustomAtom, (clipboardIn_, selectionData) => {
                let data = selectionData.get_data();
                let [valid, action_, files_] = this._parseClipboardCustomData(data);
                this._pasteMenuItem.set_sensitive(valid);

                if (!valid)
                    this._setMenuSensitivityForText();

            });
            return;
        }

        this._setMenuSensitivityForText();

    }

    _setMenuSensitivityForText() {
        let atom = Gdk.Atom.intern('CLIPBOARD', false);
        let clipboard = Gtk.Clipboard.get(atom);
        clipboard.request_text((clipboardIn_, text) => {
            let [valid, action_, files_] = this._parseClipboardText(text);
            this._pasteMenuItem.set_sensitive(valid);
        });
    }

    _syncUndoRedo() {
        switch (DBusUtils.FileOperationsProxy.UndoStatus) {
        case Enums.UndoStatus.UNDO:
            this._undoMenuItem.show();
            this._redoMenuItem.hide();
            break;
        case Enums.UndoStatus.REDO:
            this._undoMenuItem.hide();
            this._redoMenuItem.show();
            break;
        default:
            this._undoMenuItem.hide();
            this._redoMenuItem.hide();
            break;
        }
    }

    _undoStatusChanged(proxy, properties, unusedTest) {
        if ('UndoStatus' in properties.deep_unpack())
            this._syncUndoRedo();
    }

    _doUndo() {
        DBusUtils.FileOperationsProxy.UndoRemote(
            (result, error) => {
                if (error)
                    throw new Error(`Error performing undo: ${error.message}`);
            }
        );
    }

    _doRedo() {
        DBusUtils.FileOperationsProxy.RedoRemote(
            (result, error) => {
                if (error)
                    throw new Error(`Error performing redo: ${error.message}`);
            }
        );
    }

    onKeyPress(event, unusedGrid) {
        if (this.getRenaming())
            return false;

        let symbol = event.get_keyval()[1];
        let isCtrl = (event.get_state()[1] & Gdk.ModifierType.CONTROL_MASK) !== 0;
        let isShift = (event.get_state()[1] & Gdk.ModifierType.SHIFT_MASK) !== 0;
        if (isCtrl && isShift && (symbol === Gdk.KEY_Z || symbol === Gdk.KEY_z)) {
            this._doRedo();
            return true;
        } else if (isCtrl && (symbol === Gdk.KEY_Z || symbol === Gdk.KEY_z)) {
            this._doUndo();
            return true;
        } else if (isCtrl && (symbol === Gdk.KEY_C || symbol === Gdk.KEY_c)) {
            this.doCopy();
            return true;
        } else if (isCtrl && (symbol === Gdk.KEY_X || symbol === Gdk.KEY_x)) {
            this.doCut();
            return true;
        } else if (isCtrl && (symbol === Gdk.KEY_V || symbol === Gdk.KEY_v)) {
            this._doPaste();
            return true;
        } else if (symbol === Gdk.KEY_Return) {
            let selection = this.getCurrentSelection(false);
            if (selection && selection.length === 1) {
                selection[0].doOpen();
                return true;
            }
        } else if (symbol === Gdk.KEY_Delete) {
            if (isShift)
                this.doDeletePermanently();
            else
                this.doTrash();

            return true;
        } else if (symbol === Gdk.KEY_F2) {
            let selection = this.getCurrentSelection(false);
            if (selection && selection.length === 1) {
                // Support renaming other grids file items.
                this.startRename(selection[0]);
                return true;
            }
        } else if (symbol === Gdk.KEY_space) {
            let selection = this.getCurrentSelection(false);
            if (selection) {
                // Support renaming other grids file items.
                DBusUtils.GnomeNautilusPreviewProxy.ShowFileRemote(selection[0].uri, 0, true);
                return true;
            }
        } else if (isCtrl && (symbol === Gdk.KEY_A || symbol === Gdk.KEY_a)) {
            this._selectAll();
            return true;
        } else if (symbol === Gdk.KEY_F5) {
            this._updateDesktop();
            return true;
        } else if (isCtrl && (symbol === Gdk.KEY_H || symbol === Gdk.KEY_h)) {
            Prefs.gtkSettings.set_boolean('show-hidden', !this._showHidden);
            return true;
        } else if (symbol === Gdk.KEY_Left || symbol === Gdk.KEY_Right || symbol === Gdk.KEY_Up || symbol === Gdk.KEY_Down) {
            this._calculateNextSelection(isShift, symbol);
            return true;
        }
        return false;
    }

    _createDesktopBackgroundMenu() {
        this._menu = new Gtk.Menu();
        let newFolder = new Gtk.MenuItem({ label: _('New Folder') });
        newFolder.connect('activate', () => this._newFolder());
        this._menu.add(newFolder);

        this._newDocumentItem = new Gtk.MenuItem({ label: _('New Document') });
        this._menu.add(this._newDocumentItem);

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._pasteMenuItem = new Gtk.MenuItem({ label: _('Paste') });
        this._pasteMenuItem.connect('activate', () => this._doPaste());
        this._menu.add(this._pasteMenuItem);

        this._undoMenuItem = new Gtk.MenuItem({ label: _('Undo') });
        this._undoMenuItem.connect('activate', () => this._doUndo());
        this._menu.add(this._undoMenuItem);

        this._redoMenuItem = new Gtk.MenuItem({ label: _('Redo') });
        this._redoMenuItem.connect('activate', () => this._doRedo());
        this._menu.add(this._redoMenuItem);

        this._menu.add(new Gtk.SeparatorMenuItem());

        let selectAll = new Gtk.MenuItem({ label: _('Select all') });
        selectAll.connect('activate', () => this._selectAll());
        this._menu.add(selectAll);

        this._createSortingMenu();

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._showDesktopInFilesMenuItem = new Gtk.MenuItem({ label: _('Show Desktop in Files') });
        this._showDesktopInFilesMenuItem.connect('activate', () => this._onOpenDesktopInFilesClicked());
        this._menu.add(this._showDesktopInFilesMenuItem);

        this._openTerminalMenuItem = new Gtk.MenuItem({ label: _('Open in Terminal') });
        this._openTerminalMenuItem.connect('activate', () => this._onOpenTerminalClicked());
        this._menu.add(this._openTerminalMenuItem);

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._changeBackgroundMenuItem = new Gtk.MenuItem({ label: _('Change Background…') });
        this._changeBackgroundMenuItem.connect('activate', () => {
            let desktopFile = Gio.DesktopAppInfo.new('gnome-background-panel.desktop');
            desktopFile.launch([], null);
        });
        this._menu.add(this._changeBackgroundMenuItem);

        this._menu.add(new Gtk.SeparatorMenuItem());

        this._displaySettingsMenuItem = new Gtk.MenuItem({ label: _('Display Settings') });
        this._displaySettingsMenuItem.connect('activate', () => {
            let desktopFile = Gio.DesktopAppInfo.new('gnome-display-panel.desktop');
            desktopFile.launch([], null);
        });
        this._menu.add(this._displaySettingsMenuItem);

        this._settingsMenuItem = new Gtk.MenuItem({ label: _('Desktop Icons settings') });
        this._settingsMenuItem.connect('activate', () => Prefs.showPreferences());
        this._menu.add(this._settingsMenuItem);
        this._menu.show_all();
    }

    _createScriptsMenu(Menu) {
        if (this._scriptsList.length === 0)
            return;

        this._ScriptSubMenu = new Gtk.Menu();
        this._ScriptMenuItem = new Gtk.MenuItem({ label: _('Scripts') });
        this._ScriptMenuItem.set_submenu(this._ScriptSubMenu);
        Menu.add(this._ScriptMenuItem);
        Menu.add(new Gtk.SeparatorMenuItem());
        for (let fileItem of this._scriptsList) {
            if (fileItem[0].get_attribute_boolean('access::can-execute')) {
                let menuItemName = fileItem[0].get_name();
                let menuItemPath = fileItem[1].get_path();
                let menuItem = new Gtk.MenuItem({ label: _(`${menuItemName}`) });
                menuItem.connect('activate', () =>  this._onScriptClicked(menuItemPath));
                this._ScriptSubMenu.add(menuItem);
            }
        }
        this._ScriptSubMenu.show_all();
    }

    _selectAll() {
        for (let fileItem of this._fileList) {
            if (fileItem.isAllSelectable)
                fileItem.setSelected();

        }
    }

    _createSortingMenu() {
        let sortCriteria = Prefs.desktopSettings.get_string('sort-criteria');
        this._currentSorting = Enums.StringToSortingCriteria(sortCriteria);
        this._orderAscending = Prefs.desktopSettings.get_boolean('sort-order');

        let sortingPair = { 'Name': Enums.SortingCriteria.Name,
            'Size': Enums.SortingCriteria.Size,
            'Content Type': Enums.SortingCriteria.Type,
            'Modified Time': Enums.SortingCriteria.Time };

        let orderPair = { 'Ascending': true,
            'Descending': false };

        this._sortingSubMenu = new Gtk.Menu();
        this._sortingMenuItem = new Gtk.MenuItem({ label: _('Sorting Criteria') });
        this._sortingMenuItem.set_submenu(this._sortingSubMenu);
        this._menu.add(this._sortingMenuItem);

        this._sortMenus = [];
        let lastMenu = null;
        for (let key in sortingPair) {
            let sortingEnum = sortingPair[key];
            let sortMenu = new Gtk.RadioMenuItem({ label: _(key) });
            sortMenu.connect('activate', () => this._sortingByCriteria(sortingEnum));
            sortMenu.join_group(lastMenu);
            lastMenu = sortMenu;

            this._sortingSubMenu.add(sortMenu);
            if (this._currentSorting === sortingEnum)
                sortMenu.set_active(true);

            this._sortMenus.push(sortMenu);
        }

        this._sortingSubMenu.add(new Gtk.SeparatorMenuItem());

        lastMenu = null;
        for (let key in orderPair) {
            let isAscending = orderPair[key];
            let sortMenu = new Gtk.RadioMenuItem({ label: _(key) });
            sortMenu.connect('activate', () => this._sortingByOrder(isAscending));
            sortMenu.join_group(lastMenu);
            lastMenu = sortMenu;

            this._sortingSubMenu.add(sortMenu);
            if (this._orderAscending === isAscending)
                sortMenu.set_active(true);

            this._sortMenus.push(sortMenu);
        }
    }

    _sortingByOrder(order) {
        this._doSort(this._currentSorting, order);
    }

    _sortingByCriteria(criteria) {
        this._doSort(criteria, this._orderAscending);
    }

    _doSort(criteria, order) {
        let directoryList = [];
        let fileList = [];

        for (let fileItem of this._fileList) {
            fileItem.removeFromGrid();
            fileItem.savedCoordinates = null;
            if (fileItem.isDirectory)
                directoryList.push(fileItem);
            else
                fileList.push(fileItem);

        }

        this._fileList = [];

        directoryList.sort((a, b) => {
            let compVal = SortUtil.compareValue(a, b, criteria);
            return order === compVal ? 1 : -1;
        });

        fileList.sort((a, b) => {
            let compVal = SortUtil.compareValue(a, b, criteria);
            return order === compVal ? 1 : -1;
        });

        for (let item of directoryList)
            this._fileList.push(item);


        for (let item of fileList)
            this._fileList.push(item);


        this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.OVERWRITE);

        this._orderAscending = order;
        this._currentSorting = criteria;

        let sortCriteria = Enums.SortingCriteriaToString(criteria);

        Prefs.desktopSettings.set_string('sort-criteria', sortCriteria);
        Prefs.desktopSettings.set_boolean('sort-order', order);
    }

    _onOpenDesktopInFilesClicked() {
        Gio.AppInfo.launch_default_for_uri_async(this._desktopDir.get_uri(),
            null, null,
            (source, result) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(result);
                } catch (e) {
                    log(`Error opening Desktop in Files: ${e.message}`);
                }
            }
        );
    }

    _onOpenTerminalClicked() {
        let desktopPath = this._desktopDir.get_path();
        DesktopIconsUtil.launchTerminal(desktopPath, null);
    }

    _doPaste() {
        let atom = Gdk.Atom.intern('CLIPBOARD', false);
        let clipboard = Gtk.Clipboard.get(atom);

        if (Constants.isFileManagerNemo) {
            let nemoCustomAtom = Gdk.Atom.intern('x-special/gnome-copied-files', false);
            clipboard.request_contents(nemoCustomAtom, (clipboardIn_, selectionData) => {
                let data = selectionData.get_data();
                let [valid, action, files] = this._parseClipboardCustomData(data);
                if (!valid)
                    return;

                this._requestFileOperation(action, files);
            });
        }

        clipboard.request_text((clipboardIn_, text) => {
            let [valid, action, files] = this._parseClipboardText(text);
            if (!valid)
                return;

            this._requestFileOperation(action, files);
        });

    }

    _requestFileOperation(action, files) {
        let desktopDir = this._desktopDir.get_uri();

        if (action === 'cut') {
            DBusUtils.FileOperationsProxy.MoveURIsRemote(files, desktopDir,
                (result, error) => {
                    if (error)
                        throw new Error(`Error moving files: ${error.message}`);
                }
            );
        } else if (action === 'copy') {
            DBusUtils.FileOperationsProxy.CopyURIsRemote(files, desktopDir,
                (result, error) => {
                    if (error)
                        throw new Error(`Error copying files: ${error.message}`);
                });
        } else {
            throw new Error('Unidentified Action Error from File Manager');
        }
    }

    _parseClipboardText(text) {
        if (text === null)
            return [false, false, null];

        let lines = text.split('\n');
        let [mime, action, ...files] = lines;

        if (mime !== Constants.CLIPBOARD_TEXT)
            return [false, false, null];

        if (!['copy', 'cut'].includes(action))
            return [false, false, null];

        /* Last line is empty due to the split */
        if (files.length <= 1)
            return [false, false, null];

        /* Remove last line */
        files.pop();

        return [true, action, files];
    }

    _parseClipboardCustomData(data) {
        let text = ByteArray.toString(data);
        if (text === null)
            return [false, false, null];

        let lines = text.split('\n');
        let [action, ...files] = lines;

        if (!['copy', 'cut'].includes(action))
            return [false, false, null];

        if (files.length === 0)
            return [false, false, null];

        return [true, action, files];
    }

    onMotion(x, y) {
        if (this.rubberBand) {
            this.mouseX = x;
            this.mouseY = y;
            for (let grid of this._desktops)
                grid.queueDraw();

            let x1 = Math.min(x, this.rubberBandInitX);
            let x2 = Math.max(x, this.rubberBandInitX);
            let y1 = Math.min(y, this.rubberBandInitY);
            let y2 = Math.max(y, this.rubberBandInitY);
            for (let item of this._fileList)
                item.updateRubberband(x1, y1, x2, y2);

        }
        return false;
    }

    onReleaseButton(unusedGrid) {
        if (this.rubberBand) {
            this.rubberBand = false;
            for (let item of this._fileList)
                item.endRubberband();

        }
        for (let gridMap of this._desktops)
            gridMap.queueDraw();

        return false;
    }

    _startRubberband(x, y) {
        this.rubberBandInitX = x;
        this.rubberBandInitY = y;
        this.mouseX = x;
        this.mouseY = y;
        this.rubberBand = true;
        for (let item of this._fileList)
            item.startRubberband(x, y);

    }

    selected(fileItem, action) {
        switch (action) {
        case Enums.Selection.ALONE:
            if (!fileItem.isSelected) {
                for (let item of this._fileList) {
                    if (item === fileItem)
                        item.setSelected();
                    else
                        item.unsetSelected();

                }
            }
            break;
        case Enums.Selection.WITH_SHIFT:
            fileItem.toggleSelected();
            break;
        case Enums.Selection.RIGHT_BUTTON:
            if (!fileItem.isSelected) {
                for (let item of this._fileList) {
                    if (item === fileItem)
                        item.setSelected();
                    else
                        item.unsetSelected();

                }
            }
            break;
        case Enums.Selection.ENTER:
            if (this.rubberBand)
                fileItem.setSelected();

            break;
        case Enums.Selection.RELEASE:
            for (let item of this._fileList) {
                if (item === fileItem)
                    item.setSelected();
                else
                    item.unsetSelected();

            }
            break;
        }

        // When click an item, reset pivot for shift selection.
        this._selectionCalculator.resetPivot();
    }

    _removeAllFilesFromGrids() {
        for (let fileItem of this._fileList)
            fileItem.removeFromGrid();

        this._fileList = [];
    }

    _updateScriptFileList() {
        if (this._scriptsEnumerateCancellable) {
            this._scriptFilesChanged = true;
            return;
        }
        this._readScriptFileList();
    }

    _readScriptFileList() {
        if (!this._scriptsDir.query_exists(null)) {
            this._scriptsList = [];
            return;
        }
        this._scriptFilesChanged = false;
        if (this._scriptsEnumerateCancellable)
            this._scriptsEnumerateCancellable.cancel();

        this._scriptsEnumerateCancellable = new Gio.Cancellable();
        this._scriptsDir.enumerate_children_async(
            Enums.DEFAULT_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            this._scriptsEnumerateCancellable,
            (source, result) => {
                this._scriptsEnumerateCancellable = null;
                try {
                    if (!this._scriptFilesChanged) {
                        let fileEnum = source.enumerate_children_finish(result);
                        let scriptsList = [];
                        let info;
                        while ((info = fileEnum.next_file(null)))
                            scriptsList.push([info, fileEnum.get_child(info)]);

                        this._scriptsList = scriptsList.sort(
                            (a, b) => {
                                return a[0].get_name().localeCompare(b[0].get_name(),
                                    { sensitivity: 'accent', numeric: 'true', localeMatcher: 'lookup' });
                            }
                        );
                    } else {
                        this._readScriptFileList();
                    }
                } catch (e) {
                }
            }
        );
    }

    _readFileList() {
        this._readingDesktopFiles = true;
        this._desktopFilesChanged = false;
        if (this._desktopEnumerateCancellable)
            this._desktopEnumerateCancellable.cancel();

        this._desktopEnumerateCancellable = new Gio.Cancellable();
        this._desktopDir.enumerate_children_async(
            Enums.DEFAULT_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            this._desktopEnumerateCancellable,
            (source, result) => {
                try {
                    let fileEnum = source.enumerate_children_finish(result);
                    if (!this._desktopFilesChanged) {
                        let fileList = [];
                        // if no file changed while reading the desktop folder, the fileItems list if right
                        this._readingDesktopFiles = false;
                        for (let [newFolder, extras] of DesktopIconsUtil.getExtraFolders()) {
                            fileList.push(
                                new FileItem.FileItem(
                                    this,
                                    newFolder,
                                    newFolder.query_info(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null),
                                    extras,
                                    this._codePath,
                                    null
                                )
                            );
                        }
                        let info;
                        while ((info = fileEnum.next_file(null))) {
                            let fileItem = new FileItem.FileItem(
                                this,
                                fileEnum.get_child(info),
                                info,
                                Enums.FileType.NONE,
                                this._codePath,
                                null
                            );
                            if (fileItem.isHidden && !this._showHidden) {
                                /* if there are hidden files in the desktop and the user doesn't want to
                                   show them, remove the coordinates. This ensures that if the user enables
                                   showing them, they won't fight with other icons for the same place
                                */
                                if (fileItem.savedCoordinates) {
                                    // only overwrite them if needed
                                    fileItem.savedCoordinates = null;
                                }
                                continue;
                            }
                            fileList.push(fileItem);
                            if (fileItem.dropCoordinates === null) {
                                let basename = fileItem.file.get_basename();
                                if (basename in this._pendingDropFiles) {
                                    fileItem.dropCoordinates = this._pendingDropFiles[basename];
                                    delete this._pendingDropFiles[basename];
                                }
                            }
                        }
                        for (let [newFolder, extras, volume] of DesktopIconsUtil.getMounts(this._volumeMonitor)) {
                            try {
                                fileList.push(
                                    new FileItem.FileItem(
                                        this,
                                        newFolder,
                                        newFolder.query_info(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null),
                                        extras,
                                        this._codePath,
                                        volume
                                    )
                                );
                            } catch (e) {
                                print(`Failed with ${e} while adding volume ${newFolder}`);
                            }
                        }
                        this._removeAllFilesFromGrids();
                        this._fileList = fileList;
                        this._addFilesToDesktop(this._fileList, Enums.StoredCoordinates.PRESERVE);
                    } else {
                        // But if there was a file change, we must re-read it to be sure that the list is complete
                        this._readFileList();
                    }
                } catch (e) {
                    GLib.idle_add(GLib.PRIORITY_LOW, () => {
                        this._readFileList();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        );
    }

    _addFilesToDesktop(fileList, storeMode) {
        let outOfDesktops = [];
        let notAssignedYet = [];

        // First, add those icon that fit in the current desktops
        for (let fileItem of fileList) {
            if (fileItem.savedCoordinates === null) {
                notAssignedYet.push(fileItem);
                continue;
            }

            if (!this._addFileToDesktop(fileItem, storeMode))
                outOfDesktops.push(fileItem);

        }

        // Now, assign those icons that are outside the current desktops,
        // but have assigned coordinates
        for (let fileItem of outOfDesktops)
            this._addOutOfDesktopFile(fileItem, storeMode);


        // Finally, assign those icons that still don't have coordinates
        for (let fileItem of notAssignedYet)
            this._addNotAssignedFileToDestkop(fileItem, storeMode);

    }

    _addFileToDesktop(fileItem, storeMode) {
        if (fileItem.dropCoordinates !== null)
            fileItem.dropCoordinates = null;

        let [itemX, itemY] = fileItem.savedCoordinates;
        for (let desktop of this._desktops) {
            if (desktop.getDistance(itemX, itemY) === 0) {
                desktop.addFileItemCloseTo(fileItem, itemX, itemY, storeMode);
                return true;
            }
        }

        return false;
    }

    _addOutOfDesktopFile(fileItem, storeMode) {
        let minDistance = -1;
        let [itemX, itemY] = fileItem.savedCoordinates;
        let newDesktop = null;
        for (let desktop of this._desktops) {
            let distance = desktop.getDistance(itemX, itemY);
            if (distance === -1)
                continue;

            if (minDistance === -1 || distance < minDistance) {
                minDistance = distance;
                newDesktop = desktop;
            }
        }
        if (newDesktop === null)
            print('Not enough space to add icons');
        else
            newDesktop.addFileItemCloseTo(fileItem, itemX, itemY, storeMode);

    }


    _addNotAssignedFileToDestkop(fileItem, storeMode) {
        // no assigned coordinate
        let x, y;
        if (fileItem.dropCoordinates === null) {
            x = this._primaryScreen.x;
            y = this._primaryScreen.y;
            storeMode = Enums.StoredCoordinates.ASSIGN;
        } else {
            [x, y] = fileItem.dropCoordinates;
            fileItem.dropCoordinates = null;
            storeMode = Enums.StoredCoordinates.OVERWRITE;
        }

        // try first in the designated desktop
        let assigned = false;
        for (let desktop of this._desktops) {
            if (desktop.getDistance(x, y) === 0) {
                desktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                assigned = true;
                break;
            }
        }

        if (assigned)
            return;

        // if there is no space in the designated desktop, try in another
        for (let desktop of this._desktops) {
            if (desktop.getDistance(x, y) !== -1) {
                desktop.addFileItemCloseTo(fileItem, x, y, storeMode);
                break;
            }
        }
    }

    _updateWritableByOthers() {
        let info = this._desktopDir.query_info(Gio.FILE_ATTRIBUTE_UNIX_MODE,
            Gio.FileQueryInfoFlags.NONE,
            null);
        this.unixMode = info.get_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE);
        let writableByOthers = (this.unixMode & Enums.S_IWOTH) !== 0;
        if (writableByOthers !== this.writableByOthers) {
            this.writableByOthers = writableByOthers;
            if (this.writableByOthers)
                print('desktop-icons: Desktop is writable by others - will not allow launching any desktop files');

            return true;
        } else {
            return false;
        }
    }

    _updateDesktop() {
        if (this._readingDesktopFiles) {
            // just notify that the files changed while being read from the disk.
            this._desktopFilesChanged = true;
        } else {
            this._readFileList();
        }
    }

    _updateDesktopIfChanged(file, otherFile, eventType) {
        if (eventType === Gio.FileMonitorEvent.CHANGED) {
            // use only CHANGES_DONE_HINT
            return;
        }
        if (!this._showHidden && file.get_basename()[0] === '.') {
            // If the file is not visible, we don't need to refresh the desktop
            // Unless it is a hidden file being renamed to visible
            if (!otherFile || otherFile.get_basename()[0] === '.')
                return;

        }
        if (this._readingDesktopFiles) {
            // just notify that the files changed while being read from the disk.
            this._desktopFilesChanged = true;
            return;
        }

        switch (eventType) {
        case Gio.FileMonitorEvent.MOVED_IN:
        case Gio.FileMonitorEvent.MOVED:
        case Gio.FileMonitorEvent.CREATED:
            return this.onFileCreated(file);
        case Gio.FileMonitorEvent.ATTRIBUTE_CHANGED:
            return this.onFileAttributeChanged(file);
        case Gio.FileMonitorEvent.RENAMED:
            return this.onFileRenamed(file, otherFile);
        case Gio.FileMonitorEvent.DELETED:
        case Gio.FileMonitorEvent.MOVED_OUT:
            return this.onFileDeleted(file);
        }
    }

    onFileCreated(file) {
        /* Remove the coordinates that could exist to avoid conflicts between
         files that are already in the desktop and the new one
       */
        try {
            let info = new Gio.FileInfo();
            info.set_attribute_string(Constants.ICON_POSITION_METADATA, '');
            file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
        } // can happen if a file is created and deleted very fast

        this.createIcon(file);

        let fileName = file.get_basename();
        if (this._createdFileName !== fileName)
            return;


        this.startRename(this.getFileItem(file.get_uri()));
    }

    onFileAttributeChanged(file) {
        /* The desktop is what changed, and not a file inside it */
        if (file.get_uri() === this._desktopDir.get_uri()) {
            if (this._updateWritableByOthers())
                return this._readFileList();
        }
        let fileInfo = file.query_info(Enums.DEFAULT_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE, null);

        let overwriteFile = this.getFileItem(file.get_uri());
        if (!overwriteFile)
            return;

        overwriteFile.updateMetadataFromFileInfo(fileInfo);
    }

    onFileDeleted(file) {
        // When the 'Desktop' directory path was changed, we should reload
        // whole contents associated with that.
        if (file.get_uri() === this._desktopDir.get_uri())
            this._initDesktop();
        else
            this.removeIcon(file);
    }

    createIcon(file) {
        let fileItem = new FileItem.FileItem(
            this,
            file,
            file.query_info(Enums.DEFAULT_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null),
            Enums.FileType.NONE,
            this._codePath,
            null
        );

        this._fileList.push(fileItem);

        let storeMode = Enums.StoredCoordinates.OVERWRITE;
        if (fileItem.savedCoordinates === null)
            this._addNotAssignedFileToDestkop(fileItem, storeMode);
        else if (!this._addFileToDesktop(fileItem, storeMode))
            this._addOutOfDesktopFile(fileItem, storeMode);

        return fileItem;
    }

    onFileRenamed(oldFile, newFile) {
        let oldItem = this.getFileItem(oldFile.get_uri());
        if (!oldItem)
            return;


        if (oldItem.dropCoordinates) {
            let [X, Y] = oldItem.savedCoordinates;
            let info = new Gio.FileInfo();
            info.set_attribute_string(Constants.ICON_POSITION_METADATA, `${X},${Y}`);
            newFile.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
        }
        this.removeIcon(oldFile);

        // If the file is overwritten, erase the original icon and recreate it
        let overwriteFile = this.getFileItem(newFile.get_uri());
        if (overwriteFile)
            this.removeIcon(newFile);


        let newIcon = this.createIcon(newFile);

        if (this._renamedFileName === oldFile.get_basename())
            newIcon.focusItem();



        this._renamedFileName = null;
    }

    removeIcon(file) {
        let uri = file.get_uri();
        let len = this._fileList.length;
        let index = -1;

        for (let i = 0; i < len; i++) {
            if (this._fileList[i].uri === uri) {
                index = i;
                break;
            }
        }

        if (index === -1)
            return;


        let item = this._fileList[index];
        item.removeFromGrid();
        this._fileList.splice(index, 1);
    }

    _getClipboardText(isCopy) {
        let selection = this.getCurrentSelection(true);
        if (selection) {
            let atom = Gdk.Atom.intern('CLIPBOARD', false);
            let clipboard = Gtk.Clipboard.get(atom);
            let text = `${Constants.CLIPBOARD_TEXT}\n${isCopy ? 'copy' : 'cut'}\n`;
            for (let item of selection)
                text += `${item}\n`;

            clipboard.set_text(text, -1);
        }
    }

    doCopy() {
        this._getClipboardText(true);
    }

    doCut() {
        this._getClipboardText(false);
    }

    doTrash() {
        let selection = this.getCurrentSelection(true);
        if (selection) {
            DBusUtils.FileOperationsProxy.TrashFilesRemote(selection,
                (source, error) => {
                    if (error)
                        throw new Error(`Error trashing files on the desktop: ${error.message}`);
                }
            );
        }
    }

    _deleteHelper(file) {
        file.delete_async(GLib.PRIORITY_DEFAULT, null, (source, res) => {
            this._deletingFilesRecursively = false;
            try {
                source.delete_finish(res);
            } catch (e) {
                let windowError = new ShowErrorPopup.ShowErrorPopup(
                    _('Error while deleting files'),
                    e.message,
                    null,
                    false);
                windowError.run();
                this._toDelete = [];
                return;
            }
            // continue with the next file
            this._deleteRecursively();
        });
    }

    _deleteRecursively() {
        if (this._deletingFilesRecursively || this._toDelete.length === 0)
            return;

        this._deletingFilesRecursively = true;
        let nextFileToDelete = this._toDelete.shift();
        if (nextFileToDelete.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) === Gio.FileType.DIRECTORY) {
            nextFileToDelete.enumerate_children_async(
                Enums.DEFAULT_ATTRIBUTES,
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                GLib.PRIORITY_DEFAULT,
                null,
                (source, res) => {
                    try {
                        let fileEnum = source.enumerate_children_finish(res);
                        // insert again the folder at the beginning
                        this._toDelete.unshift(source);
                        let info;
                        let hasChilds = false;
                        while ((info = fileEnum.next_file(null))) {
                            let file = fileEnum.get_child(info);
                            // insert the children to the beginning of the array, to be deleted first
                            this._toDelete.unshift(file);
                            hasChilds = true;
                        }
                        if (!hasChilds) {
                            // the folder is empty, so it can be deleted
                            this._deleteHelper(this._toDelete.shift());
                        } else {
                            // continue processing the list
                            this._deletingFilesRecursively = false;
                            this._deleteRecursively();
                        }
                    } catch (e) {
                        let windowError = new ShowErrorPopup.ShowErrorPopup(
                            _('Error while deleting files'),
                            e.message,
                            null,
                            false);
                        windowError.run();
                        this._toDelete = [];
                        this._deletingFilesRecursively = false;

                    }
                });
        } else {
            this._deleteHelper(nextFileToDelete);
        }
    }

    doDeletePermanently() {
        let filelist = '';
        for (let fileItem of this._fileList) {
            if (fileItem.isSelected) {
                if (filelist !== '')
                    filelist += ', ';

                filelist += `"${fileItem.fileName}"`;
            }
        }
        let confirmWindow = new AskConfirmPopup.AskConfirmPopup(
            _('Are you sure you want to permanently delete these items?'),
            `${_('If you delete an item, it will be permanently lost.')}\n\n${filelist}`,
            null);
        if (confirmWindow.run()) {
            this._permanentDeleteError = false;
            for (let fileItem of this._fileList) {
                if (fileItem.isSelected)
                    this._toDelete.push(fileItem.file);

            }
            this._deleteRecursively();
        }
    }

    doEmptyTrash() {
        DBusUtils.FileOperationsProxy.EmptyTrashRemote((source, error) => {
            if (error)
                throw new Error(`Error trashing files on the desktop: ${error.message}`);
        });
    }

    checkIfSpecialFilesAreSelected() {
        for (let item of this._fileList) {
            if (item.isSelected && item.isSpecial)
                return true;

        }
        return false;
    }

    checkIfDirectoryIsSelected() {
        for (let item of this._fileList) {
            if (item.isSelected && item.isDirectory)
                return true;

        }
        return false;
    }

    getCurrentSelection(getUri) {
        let listToTrash = [];
        for (let fileItem of this._fileList) {
            if (fileItem.isSelected) {
                if (getUri)
                    listToTrash.push(fileItem.file.get_uri());
                else
                    listToTrash.push(fileItem);

            }
        }
        if (listToTrash.length !== 0)
            return listToTrash;
        else
            return null;

    }

    getNumberOfSelectedItems() {
        let count = 0;
        for (let item of this._fileList) {
            if (item.isSelected)
                count++;

        }
        return count;
    }

    startRename(fileItem) {
        if (fileItem.isSystemFolder)
            return;


        for (let item of this._fileList)
            item.unsetSelected();

        fileItem.startRename();
        this._renamedFileName = fileItem.fileName;
    }

    getFileItem(uri) {
        for (let item of this._fileList) {
            if (item.uri === uri)
                return item;

        }

        return null;
    }


    doOpenWith(fileItem) {
        let parentWindow;
        let [x, y, a_, b_, c_] = fileItem.getCoordinates();
        for (let desktop of this._desktops) {
            if (desktop._coordinatesBelongToThisGrid(x, y)) {
                parentWindow = desktop._window;
                break;
            }
        }

        let fileItems = this.getCurrentSelection(false);
        if (fileItems) {
            let mimetype = Gio.content_type_guess(fileItems[0].fileName, null)[0];
            // Set parent window because WM determines
            // whether to skip the dialog to the taskbar with the presence of a parent window
            // and  hint value.
            let chooser = Gtk.AppChooserDialog.new_for_content_type(parentWindow,
                Gtk.DialogFlags.MODAL + Gtk.DialogFlags.USE_HEADER_BAR,
                mimetype);
            chooser.set_skip_taskbar_hint(true);
            chooser.show_all();
            let retval = chooser.run();
            chooser.hide();
            if (retval === Gtk.ResponseType.OK) {
                let appInfo = chooser.get_app_info();
                if (appInfo) {
                    let fileList = [];
                    for (let item of fileItems)
                        fileList.push(item.file);

                    appInfo.launch(fileList, null);
                }
            }

        }
    }

    _newFolder(position) {
        let X;
        let Y;
        if (position)
            [X, Y] = position;
        else
            [X, Y] = [this._clickX, this._clickY];

        for (let fileItem of this._fileList)
            fileItem.unsetSelected();

        let baseName = _('Untitled Folder');
        let newName = baseName;
        let count = 2;
        let dir = this._desktopDir.get_child(newName);
        while (dir.query_exists(null)) {
            newName = baseName.concat(' ', (count++).toString());
            dir = this._desktopDir.get_child(newName);
        }
        try {
            dir.make_directory(null);
            let info = new Gio.FileInfo();
            info.set_attribute_string(Constants.DND_POSITION_METADATA, `${X},${Y}`);
            info.set_attribute_string(Constants.ICON_POSITION_METADATA, '');
            dir.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
            this._createdFileName = newName;

            if (position)
                return dir.get_uri();

        } catch (e) {
        }
        return null;
    }

    _newDocument(template) {
        let file = this._templateManager.getTemplateFile(template['file']);
        if (file === null)
            return;

        let counter = 0;
        let finalName = `${template['name']}${template['extension']}`;
        let destination;
        do {
            if (counter !== 0)
                finalName = `${template['name']} ${counter}${template['extension']}`;

            destination = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP), finalName]));
            counter++;
        } while (destination.query_exists(null));
        try {
            file.copy(destination, Gio.FileCopyFlags.NONE, null, null);
            let info = new Gio.FileInfo();
            info.set_attribute_string(Constants.DND_POSITION_METADATA, `${this._clickX},${this._clickY}`);
            info.set_attribute_string(Constants.ICON_POSITION_METADATA, '');
            destination.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
            print(`Failed to create template ${e.message}`);
        }
    }

    _onScriptClicked(menuItemPath) {
        let pathList = [];
        let uriList = [];
        for (let item of this._fileList) {
            if (item.isSelected &&  !item.isSpecial) {
                pathList.push(`'${item.file.get_path()}\n'`);
                uriList.push(`'${item.file.get_uri()}\n'`);
            }
        }
        pathList = pathList.join('');
        uriList = uriList.join('');
        let desktop = `'${this._desktopDir.get_uri()}'`;
        let execline = '/bin/bash -c "';
        execline += `${Constants.SCRIPT_SELECTED_FILE_PATHS}=${pathList} `;
        execline += `${Constants.SCRIPT_SELECTED_URIS}=${uriList} `;
        execline += `${Constants.SCRIPT_CURRENT_URI}=${desktop} `;
        execline += `'${menuItemPath}'"`;
        DesktopIconsUtil.spawnCommandLine(execline);
    }

    doMultiOpen() {
        let openFileListItems = this.getCurrentSelection();
        for (let fileItem of openFileListItems) {
            fileItem.unsetSelected();
            fileItem.doOpen();
        }
    }

    mailFilesFromSelection() {
        if (this.checkIfDirectoryIsSelected()) {
            let WindowError = new ShowErrorPopup.ShowErrorPopup(_('Can not email a Directory'),
                _('Selection includes a Directory, compress the directory to a file first.'),
                null,
                false);
            WindowError.run();
            return;
        }
        let xdgEmailCommand = [];
        xdgEmailCommand.push('xdg-email');
        for (let fileItem of this._fileList) {
            if (fileItem.isSelected) {
                fileItem.unsetSelected();
                xdgEmailCommand.push('--attach');
                xdgEmailCommand.push(fileItem.file.get_path());
            }
        }
        DesktopIconsUtil.trySpawn(null, xdgEmailCommand);
    }

    doCompressFilesFromSelection() {
        let compressFileItems = this.getCurrentSelection(true);
        for (let fileItem of this._fileList)
            fileItem.unsetSelected();

        let desktopFolder = this._desktopDir.get_uri();
        if (desktopFolder) {
            DBusUtils.GnomeArchiveManagerProxy.CompressRemote(compressFileItems, desktopFolder, true,
                (result, error) => {
                    if (error)
                        throw new Error(`Error compressing files: ${error.message}`);

                }
            );
        }
    }

    _calculateNextSelection(isShift, symbol) {
        let currentSelection = this.getCurrentSelection(false);
        let nextSelection =
        this._selectionCalculator.getNextSelection(currentSelection, this._fileList, symbol);

        // No more room to move
        if (nextSelection.length === 0)
            return;


        let nextFocusItem = nextSelection[0];

        if (isShift) {
            nextSelection = this._selectionCalculator.getShiftSelectedButtons(this._fileList,
                nextFocusItem);
        }

        for (let item of this._fileList)
            item.unsetSelected();

        for (let item of nextSelection)
            item.setSelected();

        // To ensure next shift selection
        nextFocusItem.focusItem();
    }

    getRenaming() {
        for (let item of this._fileList) {
            if (item.beingRenamed())
                return item;

        }
        return null;
    }
};