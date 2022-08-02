const { Gio, Meta, Shell } = imports.gi;

const Main = imports.ui.main;

// var SHELL_KEYBINDINGS_SCHEMA = 'org.gnome.shell.keybindings';
// var WM_KEYBINDINGS_SCHEMA = 'org.gnome.desktop.wm.keybindings';
var SHELL_EXTENSIONS_TOS_HOTKEY = 'org.gnome.shell.extensions.tos-hotkey';

function _addKeybinding(key, action, schema, handler) {
    if (Main.wm._allowedKeybindings[key])
        Main.wm.removeKeybinding(key);
    if (!Main.wm._allowedKeybindings[key]) {
        let settings = new Gio.Settings({ schema_id: schema });

        Main.wm.addKeybinding(
            key,
            settings,
            Meta.KeyBindingFlags.NONE,
            action,
            handler
        );
    }
}

function _launchApp(desktopAppId) {
    let app = Shell.AppSystem.get_default().lookup_app(desktopAppId);
    let gpuPref = app.get_app_info().get_boolean('PrefersNonDefaultGPU')
        ? Shell.AppLaunchGpu.DEFAULT
        : Shell.AppLaunchGpu.DISCRETE;

    app.launch(0, -1, gpuPref);
}

function init() { // eslint-disable-line no-unused-vars
}

function enable() { // eslint-disable-line no-unused-vars
    _addKeybinding('open-file-manager',
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        SHELL_EXTENSIONS_TOS_HOTKEY,
        _launchApp.bind(null, 'org.gnome.Nautilus.desktop'));
    _addKeybinding('open-terminal',
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        SHELL_EXTENSIONS_TOS_HOTKEY,
        _launchApp.bind(null, 'org.gnome.Terminal.desktop'));
}

function disable() { // eslint-disable-line no-unused-vars
    Main.wm.removeKeybinding('open-file-manager');
    Main.wm.removeKeybinding('open-terminal');
}
