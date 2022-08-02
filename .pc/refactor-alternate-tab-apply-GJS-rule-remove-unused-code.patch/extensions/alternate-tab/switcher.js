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

var WINDOW_PREVIEW_SIZE = 256;
var APP_ICON_SIZE = 128;
var APP_ICON_SIZE_SMALL = 16;

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

function primaryModifier(mask){
	if(mask ==0)
		return 0;

	let primary = 1;
	while(mask > 1) {
		mask >>=1;
		primary <<=1;
	}
	return primary;
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

    show(backward, binding, mask) {
        if (this._items.length == 0)
            return false;

        if (!Main.pushModal(this)) {
            // Probably someone else has a pointer grab, try again with keyboard only
            if (!Main.pushModal(this, { options: Meta.ModalOptions.POINTER_ALREADY_GRABBED }))
                return false;
        }
        this._haveModal = true;
        this._modifierMask = primaryModifier(mask);

        this.add_actor(this._switcherList);
        this._switcherList.connect('item-activated', this._itemActivated.bind(this));
        this._switcherList.connect('item-entered', this._itemEntered.bind(this));
        this._switcherList.connect('item-removed', this._itemRemoved.bind(this));
	this._switcherList.connect('item-pressed', this._itemPressed.bind(this));
        // Need to force an allocation so we can figure out whether we
        // need to scroll when selecting
        this.opacity = 255;
        this.visible = true;
        this.get_allocation_box();

        this._initialSelection(backward, binding);

        // There's a race condition; if the user released Alt before
        // we got the grab, then we won't be notified. (See
        // https://bugzilla.gnome.org/show_bug.cgi?id=596695 for
        // details.) So we check now. (Have to do this after updating
        // selection.)
        if (this._modifierMask) {
            let [x_, y_, mods] = global.get_pointer();
            if (!(mods & this._modifierMask)) {
                this._finish(global.get_current_time());
                return true;
            }
        } else {
            this._resetNoModsTimeout();
        }

        // We delay showing the popup so that fast Alt+Tab users aren't
        // disturbed by the popup briefly flashing.
        this._initialDelayTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            POPUP_DELAY_TIMEOUT,
            () => {
                this._showImmediately();
                return GLib.SOURCE_REMOVE;
            });
        GLib.Source.set_name_by_id(this._initialDelayTimeoutId, '[gnome-shell] Main.osdWindow.cancel');
    }

    _itemPressed(switcher, n){
	    this._itemPressedHandler(n);
    }

    _itemPressedHandler(n){
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

    _itemEnteredHandler(n){
	this._hover(n)
    }

    _hover(num){
	this._switcherList._hover(num);
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

	this.child_actor =  new St.BoxLayout();
	this.actor.add_actor(this.child_actor);

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
            this._icon.add_actor(_createWindowClone(mutterWindow, size * scaleFactor));
            break;

        case AppIconMode.BOTH:
            size = WINDOW_PREVIEW_SIZE;
            this._icon.add_actor(_createWindowClone(mutterWindow, size * scaleFactor));

            if (this.app) {
                this.child_actor.add_actor(this._createAppIcon(this.app,
                                                         APP_ICON_SIZE_SMALL));
            }
            break;

        case AppIconMode.APP_ICON_ONLY:
            size = APP_ICON_SIZE;
            this._icon.add_actor(this._createAppIcon(this.app, size));
        }
	this.child_actor.add_actor(this.label, {x_fill :true, y_fill :true});

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
	Signals: {'item-leaved':{ param_types: [GObject.TYPE_INT] },
		  'item-pressed':{ param_types: [GObject.TYPE_INT] } },
}, class WindowSwitcher extends SwitcherPopup.SwitcherList {
    _init(windows, mode) {
        super._init(true);

        this.windows = windows;
        this.icons = [];
	this._hovered = -1;

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

        minHeight += spacing;
        natHeight += spacing;

        return [minHeight, natHeight];
    }

    vfunc_allocate(box) {
        let themeNode = this.get_theme_node();
        let contentBox = themeNode.get_content_box(box);
        const totalLabelHeight =
            themeNode.get_padding(St.Side.BOTTOM);

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
        childBox.y1 = childBox.y2;
    }

    addItem(item, label){
	    let bbox = new SwitcherPopup.SwitcherButton(this._squareItems);

	    bbox.set_style_class_name('tos-item-box');

	    bbox.set_child(item);
	    this._list.add_actor(bbox);

	    bbox.connect('clicked', () => this._onItemClicked(bbox));
	    bbox.connect('motion-event', () => this._onItemEnter(bbox));
	    bbox.connect('button-press-event', () => this._onItemPress(bbox));
	    bbox.connect('leave-event', () => this._onItemLeave(bbox));
	    bbox.label_actor = label;

	    this._items.push(bbox);

	    return bbox;
    }

    _onItemPress(item){
	    if(item !== this._items[this._highlighted])
		    this._itemPressed(this._items.indexOf(item));

	    return Clutter.EVENT_PROPAGATE;
    }

    _onItemLeave(item){
	    global.log('item- leave');
	    this._removeHover(this._items.indexOf(item));
    }

    highlight(index, justOutline) {
        super.highlight(index, justOutline);
	this._items[index].remove_style_pseudo_class('tos-hover');

    }

    _hover(index){
	    if(this._items[this._hovered]){
		this._items[this._hovered].remove_style_pseudo_class('tos-hover');
	    }

	    if(index == this._highlighted){
	    return;
	    }

	    this._items[index].add_style_pseudo_class('tos-hover');

	    this._hovered = index;
    }

    _removeHover(index){
	this._items[index].remove_style_pseudo_class('tos-hover');
	this._hovered = -1;
    }

    _itemPressed(n) {
	    this.emit('item-pressed', n);
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
