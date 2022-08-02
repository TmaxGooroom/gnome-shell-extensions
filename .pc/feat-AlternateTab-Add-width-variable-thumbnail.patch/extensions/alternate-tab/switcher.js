/* exported WindowSwitcherPopup*/
// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/*
 * exported WindowSwitcherPopup
            */

const { Clutter, Gio, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const SwitcherPopup = imports.ui.switcherPopup;

var MONITOR_HORIZON_PADDING_RATIO = 1 / 3;
var MONITOR_VERTICAL_PADDING_RATIO = 0.15;

var POPUP_VERTICAL_SPACING = 32;
var SWITCHER_VERTICAL_SPACING = 11;

var POPUP_SCROLL_TIME = 100;

var APPS_PER_ROW = -1;

var WINDOW_PREVIEW_SIZE = 256;
var APP_ICON_SIZE = 128;
var APP_ICON_SIZE_SMALL = 16;

var AppIconMode = {
    THUMBNAIL_ONLY: 1,
    APP_ICON_ONLY: 2,
    BOTH: 3,
};

function mod(a, b) {
    return (a + b) % b;
}

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
    }).filter((w, i, a) => !w.skip_taskbar && a.indexOf(w) === i);
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
        this._rowHeight = 0;

        this._switcherList.connect('item-pressed', this._itemPressed.bind(this));
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        let childBox = new Clutter.ActorBox();
        let primary = Main.layoutManager.primaryMonitor;

        let hPadding = Math.floor(primary.width * MONITOR_HORIZON_PADDING_RATIO);

        if (this._rowHeight === 0)
            this._rowHeight = this._switcherList._list.get_height();

        let visibleRows =  Math.floor(primary.height * (1 - MONITOR_VERTICAL_PADDING_RATIO) / this._rowHeight);
        let vPadding = primary.height - (visibleRows * this._rowHeight + POPUP_VERTICAL_SPACING + (visibleRows - 1) * SWITCHER_VERTICAL_SPACING);
        let topPadding = Math.ceil(vPadding / 2);
        let bottomPadding = Math.ceil(vPadding / 2);

        // Allocate the switcherList
        // We select a size based on an icon size that does not overflow the screen
        let [, childNaturalHeight] = this._switcherList.get_preferred_height(primary.width - hPadding);
        let [, childNaturalWidth] = this._switcherList.get_preferred_width(childNaturalHeight);

        childBox.x1 = primary.x + Math.floor((primary.width - childNaturalWidth) / 2);
        childBox.x2 = childBox.x1 + childNaturalWidth;

        childBox.y1 = Math.max(primary.y + topPadding, primary.y + Math.floor((primary.height - childNaturalHeight) / 2));
        childBox.y2 = Math.min(primary.y + primary.height - bottomPadding, childBox.y1 + childNaturalHeight);

        this._switcherList.allocate(childBox);
    }


    _itemPressed(switcher, n) {
        this._itemPressedHandler(n);
    }

    _itemPressedHandler(n) {
        this._select(n);
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
        if (action === Meta.KeyBindingAction.SWITCH_WINDOWS)
            this._select(this._next());
        else if (action === Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD)
            this._select(this._previous());
        else if (keysym === Clutter.KEY_Left)
            this._select(this._previous());
        else if (keysym === Clutter.KEY_Right)
            this._select(this._next());
        else if (keysym === Clutter.KEY_Down)
            this._select(this._nextLine());
        else if (keysym === Clutter.KEY_Up)
            this._select(this._previousLine());
        else if (keysym === Clutter.KEY_w || keysym === Clutter.KEY_W || keysym === Clutter.KEY_F4)
            this._closeWindow(this._selectedIndex);
        else
            return Clutter.EVENT_PROPAGATE;

        return Clutter.EVENT_STOP;
    }

    _scrollHandler(direction) { // eslint-disable-line no-unused-vars
    }

    _finish() {
        Main.activateWindow(this._items[this._selectedIndex].window);

        super._finish();
    }

    _nextLine() {
        if (this._selectedIndex + APPS_PER_ROW  >= this._items.length)
            return this._selectedIndex % APPS_PER_ROW;

        else
            return mod(this._selectedIndex + APPS_PER_ROW, this._items.length);

    }

    _previousLine() {
        if (this._selectedIndex - APPS_PER_ROW  < 0) {
            if (this._selectedIndex + 1 <= this._items.length % APPS_PER_ROW)
                return parseInt(this._items.length / APPS_PER_ROW) * APPS_PER_ROW  + this._selectedIndex;
            else
                return (parseInt(this._items.length / APPS_PER_ROW) - 1) * APPS_PER_ROW  + this._selectedIndex;
        } else {
            return mod(this._selectedIndex - APPS_PER_ROW, this._items.length);
        }
    }
});

var WindowIcon = GObject.registerClass(
class WindowIcon extends St.BoxLayout {
    _init(window, mode) {
        super._init({ style_class: 'alt-tab-app',
            vertical: true });

        this.window = window;

        this.child_actor =  new St.BoxLayout();
        this.add_child(this.child_actor);

        this._icon = new St.Widget({ layout_manager: new Clutter.BinLayout() });

        this.add_child(this._icon);
        this.label = new St.Label({ text: window.get_title(), style_class: 'tos-text-label' });

        let tracker = Shell.WindowTracker.get_default();
        this.app = tracker.get_window_app(window);

        let mutterWindow = this.window.get_compositor_private();
        let size;

        this._icon.destroy_all_children();

        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        switch (mode) {
        case AppIconMode.THUMBNAIL_ONLY:
            size = WINDOW_PREVIEW_SIZE;
            this._icon.add_child(_createWindowClone(mutterWindow, size * scaleFactor));
            break;

        case AppIconMode.BOTH:
            size = WINDOW_PREVIEW_SIZE;
            this._icon.add_child(_createWindowClone(mutterWindow, size * scaleFactor));

            if (this.app) {
                this.child_actor.add_child(this._createAppIcon(this.app,
                    APP_ICON_SIZE_SMALL));
            }
            break;

        case AppIconMode.APP_ICON_ONLY:
            size = APP_ICON_SIZE;
            this._icon.add_child(this._createAppIcon(this.app, size));
        }
        this.child_actor.add_child(this.label);

        this._icon.set_size(size * scaleFactor, size * scaleFactor);
    }

    _createAppIcon(app, size) {
        let appIcon = app
            ? app.create_icon_texture(size)
            : new St.Icon({ icon_name: 'icon-missing', icon_size: size });
        appIcon.y_expand = true;
        appIcon.x_align = Clutter.ActorAlign.START;
        appIcon.y_align = Clutter.ActorAlign.CENTER;

        return appIcon;
    }
});

var WindowSwitcher = GObject.registerClass({
    Signals: { 'item-pressed': { param_types: [GObject.TYPE_INT] } },
}, class WindowSwitcher extends SwitcherPopup.SwitcherList {
    _init(windows, mode) {
        super._init(true);

        this._rows = 0;

        this._parentList = new St.BoxLayout({ style_class: 'switcher-list-item-container',
            vertical: true,
            x_expand: true,
            y_expand: true });
        this._scrollView.remove_actor(this._list);
        this._scrollView.add_actor(this._parentList);
        this._parentList.add_child(this._list);

        this._lists = [];
        this._lists.push(this._list);

        this.windows = windows;
        this.icons = [];

        for (let i = 0; i < windows.length; i++) {
            let win = windows[i];
            let icon = new WindowIcon(win, mode);

            // determine apps_per_row value, but it will be unused because of variable width WindowIcon push
            if (i === 0) {
                let primary = Main.layoutManager.primaryMonitor;
                let width = primary.width * (1 - MONITOR_HORIZON_PADDING_RATIO);
                APPS_PER_ROW = Math.floor(width / icon.get_width());
            }

            // new Row add Algorithm, need to modify because of variable width WindowIcon push
            if (i > 0 && i % APPS_PER_ROW === 0) {
                this._rows++;
                let newRow = new St.BoxLayout({ style_class: 'switcher-list-item-container',
                    vertical: false,
                    x_expand: true,
                    y_expand: true });
                this._parentList.add_actor(newRow);
                this._lists.push(newRow);
            }

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

        return [minHeight, (this._rows + 1) * natHeight];
    }

    vfunc_allocate(box) {
        super.vfunc_allocate(box);
    }

    addItem(item, label) {
        let bbox = new SwitcherPopup.SwitcherButton(this._squareItems);

        bbox.set_style_class_name('tos-item-box');
        bbox.set_child(item);

        this._lists[this._rows].add_actor(bbox);

        bbox.connect('clicked', () => this._onItemClicked(bbox));
        bbox.connect('button-press-event', () => this._onItemPress(bbox));

        bbox.label_actor = label;
        this._items.push(bbox);

        return bbox;
    }

    highlight(index, justOutline) {
        if (this._items[this._highlighted]) {
            this._items[this._highlighted].remove_style_pseudo_class('outlined');
            this._items[this._highlighted].remove_style_pseudo_class('selected');
        }

        if (this._items[index]) {
            if (justOutline)
                this._items[index].add_style_pseudo_class('outlined');
            else
                this._items[index].add_style_pseudo_class('selected');
        }

        this._highlighted = index;

        let adjustment = this._scrollView.vscroll.adjustment;
        let [value] = adjustment.get_values();
        let listRow = Math.floor(index / APPS_PER_ROW);// find row boxlayout which index items belongs to, need to modify because of variable width windowicon push
        let [absItemX_, absItemY] = this._items[index].get_transformed_position();
        let [result_, posX_, posY] = this.transform_stage_point(absItemX_, absItemY);
        let [containerWidth_, containerHeight] = this.get_transformed_size();

        if (posY + this._items[index].get_height() > containerHeight)
            this._scrollToDown(index);
        else if (this._lists[listRow].allocation.y1 - value < 0)
            this._scrollToUp(index);

    }

    _scrollToUp(index) {
        let adjustment = this._scrollView.vscroll.adjustment;
        let [value, lower_, upper, stepIncrement_, pageIncrement_, pageSize] = adjustment.get_values();

        let indexRow = Math.floor(index / APPS_PER_ROW);// find row boxlayout which index items belongs to, need to modify because of variable width windowicon push
        let list = this._lists[indexRow];

        if (list.allocation.y1 < value)
            value = Math.max(0, list.allocation.y1);
        else if (list.allocation.y2 > value + pageSize)
            value = Math.min(upper, list.allocation.y2 - pageSize);

        this._scrollableRight = true;
        adjustment.ease(value, {
            progress_mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: POPUP_SCROLL_TIME,
            onComplete: () => {
                if (index === 0)
                    this._scrollableLeft = false;
                this.queue_relayout();
            },
        });
    }

    _scrollToDown(index) {
        let adjustment = this._scrollView.vscroll.adjustment;
        let [value, lower_, upper, stepIncrement_, pageIncrement_, pageSize] = adjustment.get_values();

        let indexRow = Math.floor(index / APPS_PER_ROW);
        let list = this._lists[indexRow];

        if (list.allocation.y1 < value)
            value = Math.max(0, list.allocation.y1);
        else if (list.allocation.y2 > value + pageSize)
            value = list.allocation.y1;

        this._scrollableLeft = true;

        adjustment.ease(value, {
            progress_mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: POPUP_SCROLL_TIME,
            onComplete: () => {
                if (list.allocation.y1 + pageSize > upper)
                    this._scrollableRight = false;
                this.queue_relayout();
            },
        });

    }


    _onItemPress(item) {
        if (item !== this._items[this._highlighted])
            this._itemPressed(this._items.indexOf(item));

        return Clutter.EVENT_PROPAGATE;
    }

    _itemPressed(n) {
        this.emit('item-pressed', n);
    }

    _removeWindow(window) {
        let index = this.icons.findIndex(icon => {
            return icon.window === window;
        });
        if (index === -1)
            return;

        this.icons.splice(index, 1);
        this.removeItem(index);
    }
});
