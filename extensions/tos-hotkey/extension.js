const { Clutter, Gio, Meta, Shell } = imports.gi;

const Gettext = imports.gettext;

const Main = imports.ui.main;
const Config = imports.misc.config;

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const AltF4 = Me.imports.altF4;
const SwitchMonitor = Me.imports.switchMonitor;
const Utils = Me.imports.utils;

// const SHELL_KEYBINDINGS_SCHEMA = 'org.gnome.shell.keybindings';
// const WM_KEYBINDINGS_SCHEMA = 'org.gnome.desktop.wm.keybindings';
const SHELL_EXTENSIONS_TOS_HOTKEY = 'org.gnome.shell.extensions.tos-hotkey';

let systemWidget;
let switchMonitor;

function _addKeybinding(key, schema, flags, action, handler) {
    if (Main.wm._allowedKeybindings[key])
        Main.wm.removeKeybinding(key);
    if (!Main.wm._allowedKeybindings[key]) {
        let settings = new Gio.Settings({ schema_id: schema });

        Main.wm.addKeybinding(
            key,
            settings,
            flags,
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

function _handleAltF4(display, window) {
    if (window && !window.skip_taskbar) {
        window.delete(Clutter.get_current_event_time());
    } else if (Me.state === 1) {
        if (!systemWidget)
            systemWidget = new AltF4.SystemWidget();
        systemWidget.open();
    }
}

function init() { // eslint-disable-line no-unused-vars
    Gettext.bindtextdomain(Utils.TRANSLATION_DOMAIN, Config.LOCALEDIR);
}

function enable() { // eslint-disable-line no-unused-vars
    _addKeybinding('open-file-manager',
        SHELL_EXTENSIONS_TOS_HOTKEY,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        () => {
            let defaultApp = Gio.AppInfo.get_default_for_type('inode/directory', false);
            let defaultFileManager = defaultApp.get_id();

            _launchApp(defaultFileManager);
        });

    _addKeybinding('open-terminal',
        SHELL_EXTENSIONS_TOS_HOTKEY,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        _launchApp.bind(null, 'org.gnome.Terminal.desktop'));

    _addKeybinding('open-task-manager',
        SHELL_EXTENSIONS_TOS_HOTKEY,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        _launchApp.bind(null, 'gnome-system-monitor.desktop'));

    Main.wm.setCustomKeybindingHandler('close',
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        _handleAltF4);

    Main.wm.setCustomKeybindingHandler('switch-monitor',
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        () => {
            if (!switchMonitor)
                switchMonitor = new SwitchMonitor.SwitchMonitorWidget();
            switchMonitor.open();
        });
}

function disable() { // eslint-disable-line no-unused-vars
    Main.wm.removeKeybinding('open-file-manager');
    Main.wm.removeKeybinding('open-terminal');
    Main.wm.removeKeybinding('open-task-manager');
    Main.wm.setCustomKeybindingHandler('switch-monitor',
        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
        Main.wm._startSwitcher.bind(Main.wm)
    );

    if (systemWidget)
        systemWidget.close();

    if (switchMonitor)
        switchMonitor.close();
}
