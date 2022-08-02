/* exported init SCHEMA_FILEMANAGER SCRIPT_DIR isFileManagerNemo ICON_POSITION_METADATA DND_POSITION_METADATA SCRIPT_SELECTED_FILE_PATHS SCRIPT_SELECTED_URIS SCRIPT_CURRENT_URI CLIPBOARD_TEXT*/

var SCHEMA_FILEMANAGER;
var SCRIPT_DIR;
var isFileManagerNemo;
var ICON_POSITION_METADATA;
var DND_POSITION_METADATA;
var SCRIPT_SELECTED_FILE_PATHS;
var SCRIPT_SELECTED_URIS;
var SCRIPT_CURRENT_URI;
var CLIPBOARD_TEXT;

function init(filemanager) {
    if (filemanager === 'nemo') {
        isFileManagerNemo = true;
        SCHEMA_FILEMANAGER = 'org.nemo.preferences';
        SCRIPT_DIR = '.local/share/nemo/scripts';
        ICON_POSITION_METADATA = 'metadata::nemo-icon-position';
        DND_POSITION_METADATA = 'metadata::nemo-drop-position';
        SCRIPT_SELECTED_FILE_PATHS = 'NEMO_SCRIPT_SELECTED_FILE_PATHS';
        SCRIPT_SELECTED_URIS = 'NEMO_SCRIPT_SELECTED_URIS';
        SCRIPT_CURRENT_URI = 'NEMO_SCRIPT_CURRENT_URI';
        CLIPBOARD_TEXT = 'x-special/nemo-clipboard';
        return;
    }
    isFileManagerNemo = false;
    SCHEMA_FILEMANAGER = 'org.gnome.nautilus.preferences';
    SCRIPT_DIR = '.local/share/nautilus/scripts';
    ICON_POSITION_METADATA = 'metadata::nautilus-icon-position';
    DND_POSITION_METADATA = 'metadata::nautilus-drop-position';
    SCRIPT_SELECTED_FILE_PATHS = 'NAUTILUS_SCRIPT_SELECTED_FILE_PATHS';
    SCRIPT_SELECTED_URIS = 'NAUTILUS_SCRIPT_SELECTED_URIS';
    SCRIPT_CURRENT_URI = 'NAUTILUS_SCRIPT_CURRENT_URI';
    CLIPBOARD_TEXT = 'x-special/nautilus-clipboard';
}
