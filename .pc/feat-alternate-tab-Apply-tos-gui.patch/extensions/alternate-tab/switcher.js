// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported AppSwitcherPopup, GroupCyclerPopup, WindowSwitcherPopup,
            WindowCyclerPopup */

const { Atk, Clutter, Gio, GLib, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const SwitcherPopup = imports.ui.switcherPopup;

var APP_ICON_HOVER_TIMEOUT = 200; // milliseconds

var THUMBNAIL_DEFAULT_SIZE = 256;
var THUMBNAIL_POPUP_TIME = 500; // milliseconds
var THUMBNAIL_FADE_TIME = 100; // milliseconds

var WINDOW_PREVIEW_SIZE = 128;
var APP_ICON_SIZE = 96;
var APP_ICON_SIZE_SMALL = 48;

const baseIconSizes = [96, 64, 48, 32, 22];

var AppIconMode = {
    THUMBNAIL_ONLY: 1,
    APP_ICON_ONLY: 2,
    BOTH: 3,
};

function _createWindowClone(window, size) {
    let [width, height] = window.get_size();
    let scale = Math.min(1.0, size / width, size / height);
    return new Clutter.Clone({ source: window,
                               width: width * scale,
                               height: height * scale,
                               x_align: Clutter.ActorAlign.CENTER,
                               y_align: Clutter.ActorAlign.CENTER,
                               // usual hack for the usual bug in ClutterBinLayout...
                               x_expand: true,
                               y_expand: true });
}

function getWindows(workspace) {
    // We ignore skip-taskbar windows in switchers, but if they are attached
    // to their parent, their position in the MRU list may be more appropriate
    // than the parent; so start with the complete list ...
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL,
                                              workspace);
    // ... map windows to their parent where appropriate ...
    return windows.map(w => {
        return w.is_attached_dialog() ? w.get_transient_for() : w;
    // ... and filter out skip-taskbar windows and duplicates
    }).filter((w, i, a) => !w.skip_taskbar && a.indexOf(w) == i);
}

var WindowSwitcherPopup = GObject.registerClass(
class WindowSwitcherPopup extends SwitcherPopup.SwitcherPopup {
    _init() {
        super._init();
        this._settings = new Gio.Settings({ schema_id: 'org.gnome.shell.window-switcher' });

        let windows = this._getWindowList();

        let mode = this._settings.get_enum('app-icon-mode');
        this._switcherList = new WindowSwitcher(windows, mode);
        this._items = this._switcherList.icons;
    }

    _getWindowList() {
        let workspace = null;

        if (this._settings.get_boolean('current-workspace-only')) {
            let workspaceManager = global.workspace_manager;

            workspace = workspaceManager.get_active_workspace();
        }

        return getWindows(workspace);
    }

    _closeWindow(windowIndex) {
        let windowIcon = this._items[windowIndex];
        if (!windowIcon)
            return;

        windowIcon.window.delete(global.get_current_time());
    }

    _keyPressHandler(keysym, action) {
        if (action == Meta.KeyBindingAction.SWITCH_WINDOWS)
            this._select(this._next());
        else if (action == Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD)
            this._select(this._previous());
        else if (keysym == Clutter.KEY_Left)
            this._select(this._previous());
        else if (keysym == Clutter.KEY_Right)
            this._select(this._next());
        else if (keysym === Clutter.KEY_w || keysym === Clutter.KEY_W || keysym === Clutter.KEY_F4)
            this._closeWindow(this._selectedIndex);
        else
            return Clutter.EVENT_PROPAGATE;

        return Clutter.EVENT_STOP;
    }

    _finish() {
        Main.activateWindow(this._items[this._selectedIndex].window);

        super._finish();
    }
});

var WindowIcon = GObject.registerClass(
class WindowIcon extends St.BoxLayout {
    _init(window, mode) {
        super._init({ style_class: 'alt-tab-app',
                      vertical: true });

        this.window = window;

        this._icon = new St.Widget({ layout_manager: new Clutter.BinLayout() });

        this.add_child(this._icon);
        this.label = new St.Label({ text: window.get_title() });

        let tracker = Shell.WindowTracker.get_default();
        this.app = tracker.get_window_app(window);

        let mutterWindow = this.window.get_compositor_private();
        let size;

        this._icon.destroy_all_children();

        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        switch (mode) {
        case AppIconMode.THUMBNAIL_ONLY:
            size = WINDOW_PREVIEW_SIZE;
            this._icon.add_actor(_createWindowClone(mutterWindow, size * scaleFactor));
            break;

        case AppIconMode.BOTH:
            size = WINDOW_PREVIEW_SIZE;
            this._icon.add_actor(_createWindowClone(mutterWindow, size * scaleFactor));

            if (this.app) {
                this._icon.add_actor(this._createAppIcon(this.app,
                                                         APP_ICON_SIZE_SMALL));
            }
            break;

        case AppIconMode.APP_ICON_ONLY:
            size = APP_ICON_SIZE;
            this._icon.add_actor(this._createAppIcon(this.app, size));
        }

        this._icon.set_size(size * scaleFactor, size * scaleFactor);
    }

    _createAppIcon(app, size) {
        let appIcon = app
            ? app.create_icon_texture(size)
            : new St.Icon({ icon_name: 'icon-missing', icon_size: size });
        appIcon.x_expand = appIcon.y_expand = true;
        appIcon.x_align = appIcon.y_align = Clutter.ActorAlign.END;

        return appIcon;
    }
});

var WindowSwitcher = GObject.registerClass(
class WindowSwitcher extends SwitcherPopup.SwitcherList {
    _init(windows, mode) {
        super._init(true);

        this._label = new St.Label({ x_align: Clutter.ActorAlign.CENTER,
                                     y_align: Clutter.ActorAlign.CENTER });
        this.add_actor(this._label);

        this.windows = windows;
        this.icons = [];

        for (let i = 0; i < windows.length; i++) {
            let win = windows[i];
            let icon = new WindowIcon(win, mode);

            this.addItem(icon, icon.label);
            this.icons.push(icon);

            icon._unmanagedSignalId = icon.window.connect('unmanaged', window => {
                this._removeWindow(window);
            });
        }

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _onDestroy() {
        this.icons.forEach(icon => {
            icon.window.disconnect(icon._unmanagedSignalId);
        });
    }

    vfunc_get_preferred_height(forWidth) {
        let [minHeight, natHeight] = super.vfunc_get_preferred_height(forWidth);

        let spacing = this.get_theme_node().get_padding(St.Side.BOTTOM);
        let [labelMin, labelNat] = this._label.get_preferred_height(-1);

        minHeight += labelMin + spacing;
        natHeight += labelNat + spacing;

        return [minHeight, natHeight];
    }

    vfunc_allocate(box) {
        let themeNode = this.get_theme_node();
        let contentBox = themeNode.get_content_box(box);
        const labelHeight = this._label.height;
        const totalLabelHeight =
            labelHeight + themeNode.get_padding(St.Side.BOTTOM);

        box.y2 -= totalLabelHeight;
        super.vfunc_allocate(box);

        // Hooking up the parent vfunc will call this.set_allocation() with
        // the height without the label height, so call it again with the
        // correct size here.
        box.y2 += totalLabelHeight;
        this.set_allocation(box);

        const childBox = new Clutter.ActorBox();
        childBox.x1 = contentBox.x1;
        childBox.x2 = contentBox.x2;
        childBox.y2 = contentBox.y2;
        childBox.y1 = childBox.y2 - labelHeight;
        this._label.allocate(childBox);
    }

    highlight(index, justOutline) {
        super.highlight(index, justOutline);

        this._label.set_text(index == -1 ? '' : this.icons[index].label.text);
    }

    _removeWindow(window) {
        let index = this.icons.findIndex(icon => {
            return icon.window == window;
        });
        if (index === -1)
            return;

        this.icons.splice(index, 1);
        this.removeItem(index);
    }
});
