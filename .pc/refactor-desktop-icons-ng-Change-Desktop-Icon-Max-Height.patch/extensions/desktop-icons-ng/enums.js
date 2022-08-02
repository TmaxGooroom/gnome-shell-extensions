/* exported ICON_SIZE ICON_WIDTH ICON_HEIGHT START_CORNER FileType StoredCoordinates Selection UndoStatus FileExistOperation WhatToDoWithExecutable SortingCriteria StringToSortingCriteria SortingCriteriaToString DEFAULT_ATTRIBUTES TERMINAL_SCHEMA SCHEMA_GTK SCHEMA SCHEMA_MUTTER EXEC_KEY S_IXUSR S_IWOTH LABEL_STYLE ICON_STYLE */
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

var ICON_SIZE = { 'small': 28, 'standard': 46, 'large': 80 };
var ICON_WIDTH = { 'small': 90, 'standard': 90, 'large': 108 };
var ICON_HEIGHT = { 'small': 108, 'standard': 124, 'large': 172 };
var LABEL_STYLE = { 'small': 'file-label-small', 'standard': 'file-label-standard', 'large': 'file-label-large' };
var ICON_STYLE = { 'small': 'file-icon-small', 'standard': 'file-icon-standard', 'large': 'file-icon-large' };

var START_CORNER = { 'top-left': [false, false],
    'top-right': [true, false],
    'bottom-left': [false, true],
    'bottom-right': [true, true] };

var FileType = {
    NONE: null,
    USER_DIRECTORY_HOME: 'show-home',
    USER_DIRECTORY_TRASH: 'show-trash',
    EXTERNAL_DRIVE: 'external-drive',
};

var StoredCoordinates = {
    PRESERVE: 0,
    OVERWRITE: 1,
    ASSIGN: 2,
};

var Selection = {
    ALONE: 0,
    WITH_SHIFT: 1,
    RIGHT_BUTTON: 2,
    ENTER: 3,
    LEAVE: 4,
    RELEASE: 5,
};

/* From NautilusFileUndoManagerState */
var UndoStatus = {
    NONE: 0,
    UNDO: 1,
    REDO: 2,
};

var FileExistOperation = {
    ASK: 0,
    OVERWRITE: 1,
    RENAME: 2,
    SKIP: 3,
};

var WhatToDoWithExecutable = {
    EXECUTE: 0,
    EXECUTE_IN_TERMINAL: 1,
    DISPLAY: 2,
    CANCEL: 3,
};

var SortingCriteria = {
    Name: 0,
    Size: 1,
    Type: 2,
    Time: 3,
};

function StringToSortingCriteria(criteria) {
    let sortCriteria = SortingCriteria.Name;
    switch (criteria) {
    case 'name':
        sortCriteria = SortingCriteria.Name;
        break;
    case 'type':
        sortCriteria = SortingCriteria.Type;
        break;
    case 'size':
        sortCriteria = SortingCriteria.Size;
        break;
    case 'time':
        sortCriteria = SortingCriteria.Time;
        break;
    }
    return sortCriteria;
}

function SortingCriteriaToString(criteria) {
    let sortCriteria = 'name';
    switch (criteria) {
    case SortingCriteria.Name:
        sortCriteria = 'name';
        break;
    case SortingCriteria.Type:
        sortCriteria = 'type';
        break;
    case SortingCriteria.Size:
        sortCriteria = 'size';
        break;
    case SortingCriteria.Time:
        sortCriteria = 'time';
        break;
    }
    return sortCriteria;
}

var DEFAULT_ATTRIBUTES = 'metadata::*,standard::*,access::*,time::modified,unix::mode';
var TERMINAL_SCHEMA = 'org.gnome.desktop.default-applications.terminal';
var SCHEMA_GTK = 'org.gtk.Settings.FileChooser';
var SCHEMA = 'org.gnome.shell.extensions.ding';
var SCHEMA_MUTTER = 'org.gnome.mutter';
var EXEC_KEY = 'exec';
var S_IXUSR = 0o00100;
var S_IWOTH = 0o00002;
