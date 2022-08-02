/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
 * SwitcherooControl code based on code original from Marsch84
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

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Pango = imports.gi.Pango;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GnomeDesktop = imports.gi.GnomeDesktop;

const DesktopIconsUtil = imports.desktopIconsUtil;
const Prefs = imports.preferences;
const Enums = imports.enums;
const DBusUtils = imports.dbusUtils;
const Constants = imports.constants;
const RenameView = imports.renameView;
const ShowErrorPopup = imports.showErrorPopup;

const ByteArray = imports.byteArray;
const Mainloop = imports.mainloop; /* eslint-disable-line no-restricted-properties */
const Signals = imports.signals;
const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var FileItem = class {

    constructor(desktopManager, file, fileInfo, fileExtra, codePath, custom) {
        this._desktopPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        this._custom = custom;
        this._codePath = codePath;
        this._desktopManager = desktopManager;
        this._fileExtra = fileExtra;
        this._loadThumbnailDataCancellable = null;
        this._thumbnailScriptWatch = 0;
        this._queryFileInfoCancellable = null;
        this._isSpecial = this._fileExtra !== Enums.FileType.NONE;
        this._grid = null;
        this._file = file;

        this.actor = new Gtk.EventBox({ visible: true });
        this.actor.connect('destroy', () => this._onDestroy());
        this._eventBox = new Gtk.EventBox({ visible: true });
        this.actor.set_can_focus(true);

        this._innerContainer = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this._container = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this._container.set_size_request(Prefs.getDesiredWidth(), -1);
        this._styleContext = this._innerContainer.get_style_context();
        this._eventBox.add(this._innerContainer);
        this._styleContext.add_class('container-style');

        this._icon = new Gtk.Image();
        let iconStyleContext = this._icon.get_style_context();
        iconStyleContext.add_class(Prefs.getIconStyle());
        this._iconContainer = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this._innerContainer.pack_start(this._iconContainer, false, false, 0);
        this._iconContainer.set_size_request(Prefs.getDesiredWidth(), Prefs.getIconSize());
        this._iconContainer.pack_start(this._icon, true, true, 0);
        this._iconContainer.set_baseline_position(Gtk.BaselinePosition.CENTER);

        this._label = new Gtk.Label();
        let labelStyleContext = this._label.get_style_context();
        labelStyleContext.add_class(Prefs.getLabelStyle());
        this._label.set_ellipsize(Pango.EllipsizeMode.END);
        this._label.set_line_wrap(true);
        this._label.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this._label.set_yalign(0.0);
        this._label.set_justify(Gtk.Justification.CENTER);
        this._label.set_lines(2);

        this._innerContainer.pack_start(this._label, false, true, 0);
        this._renameScrollView = new RenameView.RenameScrollView(this);
        this._innerContainer.pack_start(this._renameScrollView, true, true, 0);
        this._container.pack_start(this._eventBox, false, false, 0);
        this.actor.add(this._container);
        this._windowError = null;

        /* We need to allow the "button-press" event to pass through the callbacks, to allow the DnD to work
         * But we must avoid them to reach the main window.
         * The solution is to allow them to pass in a EventBox, used both for detecting the events and the DnD, and block them
         * in a second EventBox, located outside.
         */

        this.actor.connect('button-press-event', (unusedActor, unusedEvent) => {
            return true;
        });

        this._eventBox.connect('button-press-event', (actor, event) => this._onPressButton(actor, event));
        this._eventBox.connect('enter-notify-event', (actor, event) => this._onEnter(actor, event));
        this._eventBox.connect('leave-notify-event', (actor, event) => this._onLeave(actor, event));
        this._eventBox.connect('button-release-event', (actor, event) => this._onReleaseButton(actor, event));

        /* Set the metadata and update relevant UI */
        this.updateMetadataFromFileInfo(fileInfo);

        this._setDropDestination(this._eventBox);
        this._dragSource = this._eventBox;
        this._setDragSource(this._dragSource);
        this._menu = null;
        this._updateIcon();
        this._isSelected = false;
        this._primaryButtonPressed = false;

        if (this._attributeCanExecute && !this._isValidDesktopFile)
            this._execLine = this.file.get_path();

        if (fileExtra === Enums.FileType.USER_DIRECTORY_TRASH) {
            // if this icon is the trash, monitor the state of the directory to update the icon
            this._trashChanged = false;
            this._queryTrashInfoCancellable = null;
            this._scheduleTrashRefreshId = 0;
            this._monitorTrashDir = this._file.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            this._monitorTrashId = this._monitorTrashDir.connect('changed', (obj, unusedFile, otherFile, eventType) => {
                switch (eventType) {
                case Gio.FileMonitorEvent.DELETED:
                case Gio.FileMonitorEvent.MOVED_OUT:
                case Gio.FileMonitorEvent.CREATED:
                case Gio.FileMonitorEvent.MOVED_IN:
                    if (this._queryTrashInfoCancellable || this._scheduleTrashRefreshId) {
                        if (this._scheduleTrashRefreshId)
                            GLib.source_remove(this._scheduleTrashRefreshId);
                        this._scheduleTrashRefreshId = Mainloop.timeout_add(200, () => this._refreshTrashIcon());
                    } else {
                        this._refreshTrashIcon();
                    }
                    break;
                }
            });
        }

        this.actor.show_all();

        this._renameScrollView.setText(this.fileName, this.fileNameLength);
        this._renameScrollView.set_visible(false);

        if (this._dropCoordinates)
            this.setSelected();
    }

    _setFileName(text) {
        if (this._fileExtra === Enums.FileType.USER_DIRECTORY_HOME) {
            // TRANSLATORS: "Home" is the text that will be shown in the user's personal folder
            text = _('Home');
        }
        this._currentFileName = text;
        this._eventBox.set_tooltip_text(truncateFileName(text));
        for (let character of '.,-_@:')
            text = text.split(character).join(`${character}\u200B`);

        this._label.label = text;
        this._renameScrollView.setText(this.fileName, this.fileNameLength);
    }

    _readCoordinatesFromAttribute(fileInfo, attribute) {
        let savedCoordinates = fileInfo.get_attribute_as_string(attribute);
        if (savedCoordinates !== null && savedCoordinates !== '') {
            savedCoordinates = savedCoordinates.split(',');
            if (savedCoordinates.length >= 2) {
                if (!isNaN(savedCoordinates[0]) && !isNaN(savedCoordinates[1]))
                    return [Number(savedCoordinates[0]), Number(savedCoordinates[1])];

            }
        }
        return null;
    }

    removeFromGrid() {
        if (this._grid) {
            this._grid.removeItem(this);
            this._grid = null;
        }
        if (this._menu)
            this._menu.popdown();

    }

    _setDragSource() {
        this._dragSource.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, null, Gdk.DragAction.MOVE | Gdk.DragAction.COPY);
        let targets = new Gtk.TargetList(null);
        targets.add(Gdk.atom_intern('x-special/ding-icon-list', false), Gtk.TargetFlags.SAME_APP, 0);
        if (this._fileExtra !== Enums.FileType.USER_DIRECTORY_TRASH &&
            this._fileExtra !== Enums.FileType.USER_DIRECTORY_HOME &&
            this._fileExtra !== Enums.FileType.EXTERNAL_DRIVE) {
            targets.add(Gdk.atom_intern('x-special/gnome-icon-list', false), 0, 1);
            targets.add(Gdk.atom_intern('text/uri-list', false), 0, 2);
        }
        this._dragSource.drag_source_set_target_list(targets);
        this._dragSource.connect('drag-begin', (unusedWidget, unusedContext) => {
            this._desktopManager.onDragBegin(this);
        });
        this._dragSource.connect('drag-data-get', (widget, context, data, info, unusedTime) => {
            let dragData = this._desktopManager.fillDragDataGet(info);
            if (dragData !== null) {
                let list = ByteArray.fromString(dragData[1]);
                data.set(dragData[0], 8, list);
            }
        });
        this._dragSource.connect('drag-end', (unusedWidget, unusedContext) => {
            this._desktopManager.onDragEnd();
        });
    }

    _setDropDestination(dropDestination) {
        dropDestination.drag_dest_set(Gtk.DestDefaults.DROP | Gtk.DestDefaults.MOTION, null, Gdk.DragAction.MOVE);
        if (!(this._fileExtra === Enums.FileType.USER_DIRECTORY_TRASH ||
              this._fileExtra === Enums.FileType.USER_DIRECTORY_HOME ||
              this._fileExtra !== Enums.FileType.EXTERNAL_DRIVE ||
              this._isDirectory))
            return;


        let targets = new Gtk.TargetList(null);
        targets.add(Gdk.atom_intern('x-special/gnome-icon-list', false), 0, 1);
        targets.add(Gdk.atom_intern('text/uri-list', false), 0, 2);
        dropDestination.drag_dest_set_target_list(targets);
        dropDestination.connect('drag-data-received', (widget, context, x, y, selection, info, unusedTime) => {
            if (!(info === 1 || info === 2))
                return;

            let fileList = DesktopIconsUtil.getFilesFromFileManagerDnD(selection, info);

            if (fileList.length === 0)
                return;


            let isInList = fileList.find(item => item === this._file.get_uri());
            if (this._desktopManager.dragItem && isInList)
                return this._grid.handleDropEvent(this.savedCoordinates[0], this.savedCoordinates[1], selection, 0);


            if (this._isValidDesktopFile) {
            // open the desktopfile with these dropped files as the arguments
                this.doOpen(fileList);
                return;
            }

            if (this._fileExtra !== Enums.FileType.USER_DIRECTORY_TRASH) {
                let data = Gio.File.new_for_uri(fileList[0]).query_info('id::filesystem', Gio.FileQueryInfoFlags.NONE, null);
                let idFs = data.get_attribute_string('id::filesystem');
                if (this._desktopManager.desktopFsId === idFs) {
                    DBusUtils.FileOperationsProxy.MoveURIsRemote(fileList, this._file.get_uri(),
                        (result, error) => {
                            if (error)
                                throw new Error(`Error moving files: ${error.message}`);

                        }
                    );
                } else {
                    DBusUtils.FileOperationsProxy.CopyURIsRemote(fileList, this._file.get_uri(),
                        (result, error) => {
                            if (error)
                                throw new Error(`Error moving files: ${error.message}`);

                        }
                    );
                }
            } else {
                DBusUtils.FileOperationsProxy.TrashFilesRemote(fileList,
                    (result, error) => {
                        if (error)
                            throw new Error(`Error moving files: ${error.message}`);

                    }
                );
            }
        });


        dropDestination.connect('drag-motion', (unusedWidget, unusedContext, unusedX, unusedY, unusedTime) => {
            if (!this._styleContext.has_class('file-item-hover'))
                this._styleContext.add_class('file-item-hover');

        });
        dropDestination.connect('drag-leave', (unusedWidget, unusedContext, unusedTime) => {
            if (this._styleContext.has_class('file-item-hover'))
                this._styleContext.remove_class('file-item-hover');

        });
    }

    onAttributeChanged() {
        if (this._isDesktopFile)
            this._refreshMetadataAsync(true);

    }


    setCoordinates(x, y, width, height, margin, zoom, grid) {
        this._x1 = x;
        this._y1 = y;
        this._zoom = zoom;
        this._x2 = x + width * zoom - 1;
        this._y2 = y + height * zoom - 1;
        this._grid = grid;
        this._container.set_size_request(width, height);
        this._label.margin_start = margin;
        this._label.margin_end = margin;
        this._label.margin_bottom = margin;
        this._iconContainer.margin_top = margin;
    }

    getCoordinates() {
        return [this._x1, this._y1, this._x2, this._y2, this._grid];
    }

    focusItem() {
        // make desktop window active if it's not
        if (!this._grid._window.is_active)
            this._grid._window.present();

        this.actor.grab_focus();
    }

    _onDestroy() {
        /* Regular file data */
        if (this._queryFileInfoCancellable)
            this._queryFileInfoCancellable.cancel();


        /* Thumbnailing */
        if (this._thumbnailScriptWatch)
            GLib.source_remove(this._thumbnailScriptWatch);

        if (this._loadThumbnailDataCancellable)
            this._loadThumbnailDataCancellable.cancel();


        /* Trash */
        if (this._monitorTrashDir) {
            this._monitorTrashDir.disconnect(this._monitorTrashId);
            this._monitorTrashDir.cancel();
        }
        if (this._queryTrashInfoCancellable)
            this._queryTrashInfoCancellable.cancel();

        if (this._scheduleTrashRefreshId)
            GLib.source_remove(this._scheduleTrashRefreshId);

        if (this._menuId)
            this._menu.disconnect(this._menuId);

    }

    _refreshMetadataAsync(rebuild) {
        if (this._queryFileInfoCancellable)
            this._queryFileInfoCancellable.cancel();
        this._queryFileInfoCancellable = new Gio.Cancellable();
        this._file.query_info_async(Enums.DEFAULT_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            this._queryFileInfoCancellable,
            (source, result) => {
                try {
                    let newFileInfo = source.query_info_finish(result);
                    this._queryFileInfoCancellable = null;
                    this.updateMetadataFromFileInfo(newFileInfo);
                    if (rebuild)
                        this._updateIcon();

                } catch (error) {
                    if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        print(`Error getting the file info: ${error}`);
                }
            }
        );
    }

    updateMetadataFromFileInfo(fileInfo) {
        this._fileSize = fileInfo.get_size();
        this._modificationDateTime = fileInfo.get_modification_date_time();

        this._savedCoordinates = this._readCoordinatesFromAttribute(fileInfo, Constants.ICON_POSITION_METADATA);
        this._dropCoordinates = this._readCoordinatesFromAttribute(fileInfo, Constants.DND_POSITION_METADATA);

        this._fileInfo = fileInfo;

        let oldLabelText = this._currentFileName;

        this._displayName = fileInfo.get_attribute_as_string('standard::display-name');
        this._attributeCanExecute = fileInfo.get_attribute_boolean('access::can-execute');
        this._unixmode = fileInfo.get_attribute_uint32('unix::mode');
        this._writableByOthers = (this._unixmode & Enums.S_IWOTH) !== 0;
        this._attributeContentType = fileInfo.get_content_type();
        this._isDesktopFile = this._attributeContentType === 'application/x-desktop';

        if (this._isDesktopFile && this._writableByOthers)
            log(`desktop-icons: File ${this._displayName} is writable by others - will not allow launching`);

        if (this._isDesktopFile) {
            this._desktopFile = Gio.DesktopAppInfo.new_from_filename(this._file.get_path());
            if (!this._desktopFile) {
                log(`Couldn’t parse ${this._displayName} as a desktop file, will treat it as a regular file.`);
                this._isValidDesktopFile = false;
            } else {
                this._isValidDesktopFile = true;
            }
        } else {
            this._isValidDesktopFile = false;
        }

        if (this._displayName !== oldLabelText)
            this._setFileName(this._displayName);


        this._updateName();

        this._fileType = fileInfo.get_file_type();
        this._isDirectory = this._fileType === Gio.FileType.DIRECTORY;
        this._isSpecial = this._fileExtra !== Enums.FileType.NONE;
        this._isHidden = fileInfo.get_is_hidden() | fileInfo.get_is_backup();
        this._isSymlink = fileInfo.get_is_symlink();
        this._modifiedTime = fileInfo.get_attribute_uint64('time::modified');
        /*
         * This is a glib trick to detect broken symlinks. If a file is a symlink, the filetype
         * points to the final file, unless it is broken; thus if the file type is SYMBOLIC_LINK,
         * it must be a broken link.
         * https://developer.gnome.org/gio/stable/GFile.html#g-file-query-info
         */
        this._isBrokenSymlink = this._isSymlink && this._fileType === Gio.FileType.SYMBOLIC_LINK;
    }

    _updateIcon() {
        try {
            let customIcon = this._fileInfo.get_attribute_as_string('metadata::custom-icon');
            if (customIcon && customIcon !== '') {
                let customIconFile = Gio.File.new_for_uri(customIcon);
                if (customIconFile.query_exists(null)) {
                    if (this._loadImageAsIcon(customIconFile))
                        return;

                }
            }
        } catch (error) {
            print(error);
        }

        if (this._fileExtra === Enums.FileType.USER_DIRECTORY_TRASH) {
            let pixbuf = this._createEmblemedIcon(this._fileInfo.get_icon(), null);
            this._icon.set_from_pixbuf(pixbuf);
            this._dragSource.drag_source_set_icon_pixbuf(pixbuf);
            return;
        }
        let iconSet = false;

        let thumbnailFactory = GnomeDesktop.DesktopThumbnailFactory.new(GnomeDesktop.DesktopThumbnailSize.LARGE);
        if (Prefs.fileManagerSettings.get_string('show-image-thumbnails') !== 'never' &&
            thumbnailFactory.can_thumbnail(this._file.get_uri(),
                this._attributeContentType,
                this._modifiedTime)) {
            let thumbnail = thumbnailFactory.lookup(this._file.get_uri(), this._modifiedTime);
            if (thumbnail === null) {
                if (!thumbnailFactory.has_valid_failed_thumbnail(this._file.get_uri(),
                    this._modifiedTime)) {
                    let argv = [];
                    argv.push(GLib.build_filenamev([this._codePath, 'createThumbnail.js']));
                    argv.push(this._file.get_path());
                    let [unusedSuccess, pid] = GLib.spawn_async(null, argv, null,
                        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
                    if (this._thumbnailScriptWatch)
                        GLib.source_remove(this._thumbnailScriptWatch);
                    this._thumbnailScriptWatch = GLib.child_watch_add(GLib.PRIORITY_DEFAULT,
                        pid,
                        (pidC, exitCode) => {
                            this._thumbnailScriptWatch = 0;
                            if (exitCode === 0)
                                this._updateIcon();
                            else
                                print(`Failed to generate thumbnail for ${this._filePath}`);
                            GLib.spawn_close_pid(pidC);
                            return false;
                        }
                    );
                }
            } else {
                if (this._loadThumbnailDataCancellable)
                    this._loadThumbnailDataCancellable.cancel();
                this._loadThumbnailDataCancellable = new Gio.Cancellable();
                let thumbnailFile = Gio.File.new_for_path(thumbnail);
                try {
                    iconSet = this._loadImageAsIcon(thumbnailFile);
                } catch (error) {
                    if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        print(`Error while loading thumbnail: ${error}`);
                        this._icon.set_from_pixbuf(this._createEmblemedIcon(this._fileInfo.get_icon(), null));
                    }
                }
            }
        }

        if (!iconSet) {
            let pixbuf;
            if (this._isBrokenSymlink)
                pixbuf = this._createEmblemedIcon(null, 'text-x-generic');
            else if (this.trustedDesktopFile && this._desktopFile.has_key('Icon'))
                pixbuf = this._createEmblemedIcon(null, this._desktopFile.get_string('Icon'));
            else
                pixbuf = this._createEmblemedIcon(this._getDefaultIcon(), null);

            this._icon.set_from_pixbuf(pixbuf);
            this._dragSource.drag_source_set_icon_pixbuf(pixbuf);
        }
    }

    _getDefaultIcon() {
        if (this._fileExtra === Enums.FileType.EXTERNAL_DRIVE)
            return this._custom.get_icon();

        return this._fileInfo.get_icon();
    }

    _loadImageAsIcon(imageFile) {
        let [thumbnailData, unusedEtagOut] = imageFile.load_bytes(this._loadThumbnailDataCancellable);
        this._loadThumbnailDataCancellable = null;
        let thumbnailStream = Gio.MemoryInputStream.new_from_bytes(thumbnailData);
        let thumbnailPixbuf = GdkPixbuf.Pixbuf.new_from_stream(thumbnailStream, null);

        if (thumbnailPixbuf !== null) {
            let width = Prefs.getDesiredWidth();
            let height = Prefs.getIconSize();
            let aspectRatio = thumbnailPixbuf.width / thumbnailPixbuf.height;
            if (width / height > aspectRatio)
                width = height * aspectRatio;
            else
                height = width / aspectRatio;
            let pixbuf = thumbnailPixbuf.scale_simple(Math.floor(width), Math.floor(height), GdkPixbuf.InterpType.BILINEAR);
            pixbuf = this._addEmblemsToPixbufIfNeeded(pixbuf);
            this._icon.set_from_pixbuf(pixbuf);
            this._dragSource.drag_source_set_icon_pixbuf(pixbuf);
            return true;
        }
        return false;
    }

    _copyAndResizeIfNeeded(pixbuf) {
        /**
         * If the pixbuf is the original from the theme, copies it into a new one, to be able
         * to paint the emblems without altering the cached pixbuf in the theme object.
         * Also, ensures that the copied pixbuf is, at least, as big as the desired icon size,
         * to ensure that the emblems fit.
         */

        if (this._copiedPixbuf)
            return pixbuf;


        this._copiedPixbuf = true;
        let minsize = Prefs.getIconSize();
        if (pixbuf.width < minsize || pixbuf.height < minsize) {
            let width = pixbuf.width < minsize ? minsize : pixbuf.width;
            let height = pixbuf.height < minsize ? minsize : pixbuf.height;
            let newpixbuf = GdkPixbuf.Pixbuf.new(pixbuf.colorspace, true, pixbuf.bits_per_sample, width, height);
            newpixbuf.fill(0);
            let x = Math.floor((width - pixbuf.width) / 2);
            let y = Math.floor((height - pixbuf.height) / 2);
            pixbuf.composite(newpixbuf, x, y, pixbuf.width, pixbuf.height, x, y, 1, 1,  GdkPixbuf.InterpType.NEAREST, 255);
            return newpixbuf;
        } else {
            return pixbuf.copy();
        }
    }

    _addEmblemsToPixbufIfNeeded(pixbuf) {
        this._copiedPixbuf = false;
        let emblem = null;
        let finalSize = Math.floor(Prefs.getIconSize() / 3);
        if (this._isSymlink) {
            if (this._isBrokenSymlink)
                emblem = Gio.ThemedIcon.new('emblem-unreadable');
            else
                emblem = Gio.ThemedIcon.new('emblem-symbolic-link');
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_default();
            let emblemIcon = theme.lookup_by_gicon(emblem, finalSize, Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
            emblemIcon.composite(pixbuf, pixbuf.width - finalSize, pixbuf.height - finalSize, finalSize, finalSize, pixbuf.width - finalSize, pixbuf.height - finalSize, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }

        if (this.trustedDesktopFile) {
            pixbuf = this._copyAndResizeIfNeeded(pixbuf);
            let theme = Gtk.IconTheme.get_default();
            emblem = Gio.ThemedIcon.new('emblem-default');
            let emblemIcon = theme.lookup_by_gicon(emblem, finalSize, Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
            emblemIcon.composite(pixbuf, 0, 0, finalSize, finalSize, 0, 0, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
        }
        return pixbuf;
    }

    _refreshTrashIcon() {
        if (this._queryTrashInfoCancellable)
            this._queryTrashInfoCancellable.cancel();
        this._queryTrashInfoCancellable = new Gio.Cancellable();

        this._file.query_info_async(Enums.DEFAULT_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            this._queryTrashInfoCancellable,
            (source, result) => {
                try {
                    this._fileInfo = source.query_info_finish(result);
                    this._queryTrashInfoCancellable = null;
                    this._updateIcon();
                } catch (error) {
                    if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        print(`Error getting the number of files in the trash: ${error}`);
                }
            });
        this._scheduleTrashRefreshId = 0;
        return false;
    }

    get file() {
        return this._file;
    }

    get isHidden() {
        return this._isHidden;
    }

    _createEmblemedIcon(icon, iconName) {
        if (icon === null) {
            if (GLib.path_is_absolute(iconName)) {
                let iconFile = Gio.File.new_for_commandline_arg(iconName);
                icon = new Gio.FileIcon({ file: iconFile });
            } else {
                icon = Gio.ThemedIcon.new_with_default_fallbacks(iconName);
            }
        }
        let theme = Gtk.IconTheme.get_default();

        let itemIcon = null;
        try {
            itemIcon = theme.lookup_by_gicon(icon, Prefs.getIconSize(), Gtk.IconLookupFlags.FORCE_SIZE).load_icon();
        } catch (e) {
            itemIcon = theme.load_icon('text-x-generic', Prefs.getIconSize(), Gtk.IconLookupFlags.FORCE_SIZE);
        }

        itemIcon = this._addEmblemsToPixbufIfNeeded(itemIcon);

        return itemIcon;
    }

    askRename() {
        if (!this.canRename())
            return;


        this._desktopManager.startRename(this);
    }

    doOpen(fileList) {
        if (!fileList)
            fileList = [];

        this._doOpenContext(null, fileList);
    }

    _doOpenContext(context, fileList) {
        if (!fileList)
            fileList = [];

        if (this._isBrokenSymlink) {
            log(`Error: Can’t open ${this.file.get_uri()} because it is a broken symlink.`);
            return;
        }

        if (this.trustedDesktopFile) {
            this._desktopFile.launch_uris_as_manager(fileList, context, GLib.SpawnFlags.SEARCH_PATH, null, null);
            return;
        }

        if (this._attributeCanExecute && !this._isDirectory && !this._isValidDesktopFile && this._execLine) {
            let action =  DesktopIconsUtil.isExecutable(this._attributeContentType, this.file.get_basename());
            switch (action) {
            case Gtk.ResponseType.CANCEL:
                return;
            case Enums.WhatToDoWithExecutable.EXECUTE:
                DesktopIconsUtil.spawnCommandLine(`"${this._execLine}"`);
                return;
            case Enums.WhatToDoWithExecutable.EXECUTE_IN_TERMINAL:
                DesktopIconsUtil.launchTerminal(this.file.get_parent().get_path(), this._execLine);
                return;
            }
        }

        Gio.AppInfo.launch_default_for_uri_async(this.file.get_uri(),
            null, null,
            (source, result) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(result);
                } catch (e) {
                    log(`Error opening file ${this.file.get_uri()}: ${e.message}`);
                }
            }
        );
    }

    _onShowInFilesClicked() {
        let showInFilesList = this._desktopManager.getCurrentSelection(true);
        DBusUtils.FreeDesktopFileManagerProxy.ShowItemsRemote(showInFilesList, '',
            (result, error) => {
                if (error)
                    log(`Error showing file on desktop: ${error.message}`);
            }
        );
    }

    _onPropertiesClicked() {
        let propertiesFileList = this._desktopManager.getCurrentSelection(true);
        DBusUtils.FreeDesktopFileManagerProxy.ShowItemPropertiesRemote(propertiesFileList, '',
            (result, error) => {
                if (error)
                    log(`Error showing properties: ${error.message}`);
            }
        );
    }

    _updateName() {
        if (this._isValidDesktopFile && !this._desktopManager.writableByOthers && !this._writableByOthers && this.trustedDesktopFile)
            this._setFileName(this._desktopFile.get_locale_string('Name'));

        else
            this._setFileName(this._fileInfo.get_display_name());

    }

    canRename() {
        return !this.trustedDesktopFile && this._fileExtra === Enums.FileType.NONE;
    }

    _doDiscreteGpu() {
        if (!DBusUtils.SwitcherooControlProxy) {
            log('Could not apply discrete GPU environment, switcheroo-control not available');
            return;
        }
        let gpus = DBusUtils.SwitcherooControlProxy.GPUs;
        if (!gpus) {
            log('Could not apply discrete GPU environment. No GPUs in list.');
            return;
        }

        for (let gpu in gpus) {
            if (!gpus[gpu])
                continue;

            let defaultVariant = gpus[gpu]['Default'];
            if (!defaultVariant || defaultVariant.get_boolean())
                continue;

            let env = gpus[gpu]['Environment'];
            if (!env)
                continue;

            let envS = env.get_strv();
            let context = new Gio.AppLaunchContext();
            for (let i = 0; i < envS.length; i += 2)
                context.setenv(envS[i], envS[i + 1]);

            this._doOpenContext(context, null);
            return;
        }
        log('Could not find discrete GPU data in switcheroo-control');
    }

    _createMenu() {
        this._selectedItemsNum = this._desktopManager.getNumberOfSelectedItems();
        this._menu = new Gtk.Menu();
        this._menuId = this._menu.connect('hide', () => {
            this._menu.disconnect(this._menuId);
            this._menu = null;
            this._menuId = null;
        });
        let open = new Gtk.MenuItem({ label: this._selectedItemsNum > 1 ? _('Open All...') : _('Open') });
        open.connect('activate', () => {
            this._desktopManager.doMultiOpen();
        });
        this._menu.add(open);
        this._desktopManager._createScriptsMenu(this._menu);
        switch (this._fileExtra) {
        case Enums.FileType.NONE:
            if (!this._isDirectory) {
                this._actionOpenWith = new Gtk.MenuItem({ label: this._selectedItemsNum > 1 ? _('Open All With Other Application...') : _('Open With Other Application') });
                this._actionOpenWith.connect('activate', () => this._desktopManager.doOpenWith(this));
                this._menu.add(this._actionOpenWith);
                if (DBusUtils.discreteGpuAvailable && this.trustedDesktopFile) {
                    this._actionDedicatedGPU = new Gtk.MenuItem({ label: _('Launch using Dedicated Graphics Card') });
                    this._actionDedicatedGPU.connect('activate', () => this._doDiscreteGpu());
                    this._menu.add(this._actionDedicatedGPU);
                }
            } else {
                this._actionOpenWith = null;
            }
            this._menu.add(new Gtk.SeparatorMenuItem());
            this._actionCut = new Gtk.MenuItem({ label: _('Cut') });
            this._actionCut.connect('activate', () => {
                this._desktopManager.doCut();
            });
            this._menu.add(this._actionCut);
            this._actionCopy = new Gtk.MenuItem({ label: _('Copy') });
            this._actionCopy.connect('activate', () => {
                this._desktopManager.doCopy();
            });
            this._menu.add(this._actionCopy);
            if (this.canRename() && this._selectedItemsNum === 1) {
                let rename = new Gtk.MenuItem({ label: _('Rename…') });
                rename.connect('activate', () => this.askRename());
                this._menu.add(rename);
            }
            this._actionTrash = new Gtk.MenuItem({ label: _('Move to Trash') });
            this._actionTrash.connect('activate', () => {
                this._desktopManager.doTrash();
            });
            this._menu.add(this._actionTrash);
            var deleteKeyValue = Constants.isFileManagerNemo ? 'enable-delete' : 'show-delete-permanently';
            if (Prefs.fileManagerSettings.get_boolean(deleteKeyValue)) {
                this._actionDelete = new Gtk.MenuItem({ label: _('Delete permanently') });
                this._actionDelete.connect('activate', () => {
                    this._desktopManager.doDeletePermanently();
                });
                this._menu.add(this._actionDelete);
            }
            break;
        case Enums.FileType.USER_DIRECTORY_TRASH:
            this._menu.add(new Gtk.SeparatorMenuItem());
            var trashItem = new Gtk.MenuItem({ label: _('Empty Trash') });
            trashItem.connect('activate', () => {
                this._desktopManager.doEmptyTrash();
            });
            this._menu.add(trashItem);
            break;
        case Enums.FileType.EXTERNAL_DRIVE:
            this._menu.add(new Gtk.SeparatorMenuItem());
            if (this._custom.can_eject()) {
                this._volumeItem = new Gtk.MenuItem({ label: _('Eject') });
                this._volumeItem.connect('activate', () => {
                    this._custom.eject_with_operation(Gio.MountUnmountFlags.NONE, null, null, (obj, res) => {
                        obj.eject_with_operation_finish(res);
                    });
                });
            } else if (this._custom.can_unmount()) {
                this._volumeItem = new Gtk.MenuItem({ label: _('Unmount') });
                this._volumeItem.connect('activate', () => {
                    this._custom.unmount_with_operation(Gio.MountUnmountFlags.NONE, null, null, (obj, res) => {
                        obj.unmount_with_operation_finish(res);
                    });
                });
            }
            this._menu.add(this._volumeItem);
            break;
        default:
            break;
        }
        this._menu.add(new Gtk.SeparatorMenuItem());
        if (!this._desktopManager.checkIfSpecialFilesAreSelected() && this._selectedItemsNum >= 1) {
            if (!this._isDirectory) {
                let mailFilesFromSelection = new Gtk.MenuItem({ label: _('Send to...') });
                mailFilesFromSelection.connect('activate', () => {
                    this._desktopManager.mailFilesFromSelection();
                });
                this._menu.add(mailFilesFromSelection);
            }
            let compressFilesFromSelection = new Gtk.MenuItem({ label: Gettext.ngettext('Compress {0} file', 'Compress {0} files', this._selectedItemsNum).replace('{0}', this._selectedItemsNum) });
            compressFilesFromSelection.connect('activate', () => {
                this._desktopManager.doCompressFilesFromSelection();
            });
            this._menu.add(compressFilesFromSelection);
            this._menu.add(new Gtk.SeparatorMenuItem());
        }
        this._menu.add(new Gtk.SeparatorMenuItem());
        let properties = new Gtk.MenuItem({ label: this._selectedItemsNum > 1 ? _('Common Properties') : _('Properties') });
        properties.connect('activate', () => this._onPropertiesClicked());
        this._menu.add(properties);
        this._menu.add(new Gtk.SeparatorMenuItem());
        let showInFiles = new Gtk.MenuItem({ label: this._selectedItemsNum > 1 ? _('Show All in Files') : _('Show in Files') });
        showInFiles.connect('activate', () => this._onShowInFilesClicked());
        this._menu.add(showInFiles);
        if (this._isDirectory && this.file.get_path() !== null && this._selectedItemsNum === 1) {
            let openInTerminal = new Gtk.MenuItem({ label: _('Open in Terminal') });
            openInTerminal.connect('activate', () => this._onOpenTerminalClicked());
            this._menu.add(openInTerminal);
        }
        this._menu.show_all();
    }

    _onOpenTerminalClicked() {
        DesktopIconsUtil.launchTerminal(this.file.get_path(), null);
    }

    _onPressButton(actor, event) {
        let button = event.get_button()[1];
        if (button === 3) {
            if (!this._isSelected)
                this._desktopManager.selected(this, Enums.Selection.RIGHT_BUTTON);

            this._createMenu();
            this._menu.popup_at_pointer(event);
            if (this._actionOpenWith) {
                let allowOpenWith = this._selectedItemsNum > 0;
                this._actionOpenWith.set_sensitive(allowOpenWith);
            }
            let allowCutCopyTrash = this._desktopManager.checkIfSpecialFilesAreSelected();
            if (this._actionCut)
                this._actionCut.set_sensitive(!allowCutCopyTrash);
            if (this._actionCopy)
                this._actionCopy.set_sensitive(!allowCutCopyTrash);
            if (this._actionTrash)
                this._actionTrash.set_sensitive(!allowCutCopyTrash);
        } else if (button === 1) {
            if (event.get_event_type() === Gdk.EventType.BUTTON_PRESS) {
                let [unused, x, y] = event.get_coords();
                let state = event.get_state()[1];
                this._primaryButtonPressed = true;
                this._buttonPressInitialX = x;
                this._buttonPressInitialY = y;
                let shiftPressed = !!(state & Gdk.ModifierType.SHIFT_MASK);
                let controlPressed = !!(state & Gdk.ModifierType.CONTROL_MASK);
                if (shiftPressed || controlPressed)
                    this._desktopManager.selected(this, Enums.Selection.WITH_SHIFT);
                else
                    this._desktopManager.selected(this, Enums.Selection.ALONE);

            }
            if (event.get_event_type() === Gdk.EventType.DOUBLE_BUTTON_PRESS && !Prefs.CLICK_POLICY_SINGLE)
                this.doOpen();

        }
        return false;
    }

    _setSelectedStatus() {
        if (this._isSelected && !this._styleContext.has_class('desktop-icons-selected'))
            this._styleContext.add_class('desktop-icons-selected');

        if (!this._isSelected && this._styleContext.has_class('desktop-icons-selected'))
            this._styleContext.remove_class('desktop-icons-selected');

    }

    setSelected() {
        this._isSelected = true;
        this._setSelectedStatus();
    }

    unsetSelected() {
        this._isSelected = false;
        this._setSelectedStatus();
    }

    toggleSelected() {
        this._isSelected = !this._isSelected;
        this._setSelectedStatus();
    }

    get isSelected() {
        return this._isSelected;
    }

    get isAllSelectable() {
        return this._fileExtra === Enums.FileType.NONE;
    }

    get isDrive() {
        return this._fileExtra === Enums.FileType.EXTERNAL_DRIVE;
    }

    _onReleaseButton(actor, event) {
        let button = event.get_button()[1];
        if (button === 1) {
            // primaryButtonPressed is TRUE only if the user has pressed the button
            // over an icon, and if (s)he has not started a drag&drop operation
            if (this._primaryButtonPressed) {
                this._primaryButtonPressed = false;
                let shiftPressed = !!(event.get_state()[1] & Gdk.ModifierType.SHIFT_MASK);
                let controlPressed = !!(event.get_state()[1] & Gdk.ModifierType.CONTROL_MASK);
                if (!shiftPressed && !controlPressed) {
                    this._desktopManager.selected(this, Enums.Selection.RELEASE);
                    if (Prefs.CLICK_POLICY_SINGLE)
                        this.doOpen();

                }
            }
        }
        return false;
    }

    _onEnter(unusedActor, unusedEvent) {
        if (!this._styleContext.has_class('file-item-hover'))
            this._styleContext.add_class('file-item-hover');

        if (Prefs.CLICK_POLICY_SINGLE) {
            let window = this._eventBox.get_window();
            if (window)
                window.set_cursor(Gdk.Cursor.new_from_name(Gdk.Display.get_default(), 'hand'));

        }
        return false;
    }

    _onLeave(unusedActor, unusedEvent) {
        this._primaryButtonPressed = false;
        if (this._styleContext.has_class('file-item-hover'))
            this._styleContext.remove_class('file-item-hover');

        if (Prefs.CLICK_POLICY_SINGLE) {
            let window = this._eventBox.get_window();
            if (window)
                window.set_cursor(Gdk.Cursor.new_from_name(Gdk.Display.get_default(), 'default'));

        }
        return false;
    }

    startRubberband() {
        this._rubberband = true;
        this._touchedByRubberband = false;
    }

    endRubberband() {
        this._rubberband = false;
    }

    updateRubberband(x1, y1, x2, y2) {
        if (x2 < this._x1 || x1 > this._x2 || y2 < this._y1 || y1 > this._y2) {
            if (this._touchedByRubberband)
                this.unsetSelected();

        } else {
            this.setSelected();
            this._touchedByRubberband = true;
        }
    }

    startRename() {
        this._grid.reorderItemBack(this);

        this._label.set_visible(false);
        this._renameScrollView.set_visible(true);
        this._renameScrollView.startRename();
    }

    finishRename() {
        if (this.beingRenamed()) {
            this._label.set_visible(true);
            this._renameScrollView.set_visible(false);
        }
    }

    doRename() {
        if (!this.beingRenamed())
            return false;

        if (this._windowError)
            return false;


        let text = this._renameScrollView.getText();
        let fullPath = `${this._desktopPath}/${text}`;
        let file = Gio.File.new_for_commandline_arg(fullPath);
        let errorMsg;
        let newNameTruncated = truncateFileName(text);

        if (text === '') {
            this._renameScrollView.cancelRename();
        } else if (this.fileName === text) {
            this._renameScrollView.cancelRename();
        } else if (text.indexOf('/') !== -1) {
            errorMsg = _('Sorry, could not rename to “{0}”. Slashes are not allowed in filenames').replace('{0}', newNameTruncated);
            this.showRenameError(errorMsg);
            this._renameScrollView.cancelRename();
        }  else if (text.length >= 255) {
            errorMsg = _('The name “{0}” is too long. Please use a different name.').replace('{0}', newNameTruncated);
            this.showRenameError(errorMsg);
            this._renameScrollView.cancelRename();
        } else if (file.query_exists(null)) {
            errorMsg = _('The name “{0}” is already used in this folder. Please use a different name.').replace('{0}', newNameTruncated);
            this.showRenameError(errorMsg);
            this._renameScrollView.cancelRename();
        } else if (this.fileName.localeCompare(text)) {
            let pos = this.savedCoordinates;
            this.dropCoordinates = [pos[0], pos[1]];

            DBusUtils.FileOperationsProxy.RenameFileRemote(this.uri,
                text,
                (result, error) => {
                    if (error)
                        throw new Error(`Error renaming file: ${error.message}`);

                }
            );
        }

        this._renameScrollView.setRenameComplete();

        return true;
    }

    beingRenamed() {
        return this._renameScrollView.is_visible();
    }

    get savedCoordinates() {
        return this._savedCoordinates;
    }

    _onSetMetadataFileFinished(source, result) {
        try {
            let [unusedSuccess, unusedInfo] = source.set_attributes_finish(result);
        } catch (error) {
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                log('Error setting metadata to desktop files ', error);
        }
    }

    showRenameError(text) {
        this._windowError = new ShowErrorPopup.ShowErrorPopup(
            _('The Item could not be renamed.'),
            text,
            null,
            false);
        this._windowError.run();
        this._windowError = null;
    }

    set savedCoordinates(pos) {
        try {
            let info = new Gio.FileInfo();
            if (pos !== null) {
                this._savedCoordinates = [pos[0], pos[1]];
                info.set_attribute_string(Constants.ICON_POSITION_METADATA, `${pos[0]},${pos[1]}`);
            } else {
                this._savedCoordinates = null;
                info.set_attribute_string(Constants.ICON_POSITION_METADATA, '');
            }
            this.file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
            print(`Failed to store the desktop coordinates for ${this.uri}: ${e}`);
        }
    }

    get dropCoordinates() {
        return this._dropCoordinates;
    }

    set dropCoordinates(pos) {
        let info = new Gio.FileInfo();
        if (pos !== null) {
            this._dropCoordinates = [pos[0], pos[1]];
            info.set_attribute_string(Constants.DND_POSITION_METADATA, `${pos[0]},${pos[1]}`);
        } else {
            this._dropCoordinates = null;
            info.set_attribute_string(Constants.DND_POSITION_METADATA, '');
        }
        this.file.set_attributes_from_info(info, Gio.FileQueryInfoFlags.NONE, null);
    }

    get isSpecial() {
        return this._isSpecial;
    }

    get isSystemFolder() {
        return this._fileExtra === Enums.FileType.USER_DIRECTORY_TRASH ||
        this._fileExtra === Enums.FileType.USER_DIRECTORY_HOME ||
        this._fileExtra === Enums.FileType.EXTERNAL_DRIVE;
    }

    get state() {
        return this._state;
    }

    set state(state) {
        if (state === this._state)
            return;

        this._state = state;
    }

    get isDirectory() {
        return this._isDirectory;
    }

    get trustedDesktopFile() {
        return this._isValidDesktopFile &&
               this._attributeCanExecute &&
               this._desktopManager.desktopFileTrusted &&
               !this._desktopManager.writableByOthers &&
               !this._writableByOthers;
    }

    get fileName() {
        return this._displayName;
    }

    get fileNameLength() {
        return RenameView.GetByteLengthOfUtf8String(this._displayName);
    }

    get uri() {
        return this._file.get_uri();
    }

    get displayName() {
        if (this.trustedDesktopFile)
            return this._desktopFile.get_name();

        return this._displayName || null;
    }

    get fileSize() {
        return this._fileSize;
    }

    get contentType() {
        return this._attributeContentType;
    }

    get modifiedTime() {
        return this._modifiedTime;
    }

};

Signals.addSignalMethods(FileItem.prototype);

function truncateFileName(name) {
    let delimeter = '...';
    let delimeterLength = 3;
    let truncated = name;
    let maxTruncatedLength = 50;

    if (name.length < maxTruncatedLength)
        return truncated;


    let numLeftChars = (maxTruncatedLength - delimeterLength) / 2;
    let numRightChars = maxTruncatedLength - numLeftChars - delimeterLength;

    truncated = name.slice(0, numLeftChars) + delimeter + name.slice(-numRightChars);

    return truncated;
}
