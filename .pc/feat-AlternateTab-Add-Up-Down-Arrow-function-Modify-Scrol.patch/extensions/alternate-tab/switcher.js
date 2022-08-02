/* exported WindowSwitcherPopup*/
// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/*
 * exported WindowSwitcherPopup
            */

const { Clutter, Gio, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const SwitcherPopup = imports.ui.switcherPopup;

var MONITOR_HORIZON_PADDING_RATIO = 0.2;
var MONITOR_VERTICAL_PADDING_RATIO = 0.15;

var POPUP_SCROLL_TIME = 100;

// Before allocation Logic, we can't load CSS value.
// ex) spacing, padding
// But we need to precalculate Row width to determine whether or not make new Row
// If you modify tos-item-box padding value in stylesheet.css
// or gnome-shell default css code(In this case, 'switcher-list-item-container' style class in
// $gnome_shell_dir/data/theme/gnome-shell-sass/widgets/_switcher-popup.scss)
// Also need to scale below values.
// If there are another ways to load CSS value, update me
var BUTTON_PADDING = 8;
var ROW_SPACING = 12;

var WINDOW_PREVIEW_SIZE = 180;
var APP_ICON_SIZE = 128;
var APP_ICON_SIZE_SMALL = 16;

var AppIconMode = {
    THUMBNAIL_ONLY: 1,
    APP_ICON_ONLY: 2,
    BOTH: 3,
};

function _createWindowClone(window, size) {
    let [width, height] = window.get_size();
    let scale = size / height;
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

        let popupThemeNode = this.get_theme_node();
        let switcherThemeNode = this._switcherList.get_theme_node();
        let switcherVerticalLayoutThemeNode = this._switcherList._rowList.get_theme_node();

        let popupVerticalPadding = popupThemeNode.get_vertical_padding();
        let switcherPadding = switcherThemeNode.get_padding(St.Side.BOTTOM);
        let switcherVerticalSpacing = switcherVerticalLayoutThemeNode.get_length('spacing');

        let childBox = new Clutter.ActorBox();
        let primary = Main.layoutManager.primaryMonitor;

        // horizontalPadding is horizontal padding (left padding + right padding) in monitor screen (px);
        let horizontalPadding = Math.floor(primary.width * MONITOR_HORIZON_PADDING_RATIO);

        if (this._rowHeight === 0)
            this._rowHeight = this._switcherList._list.get_height();

        // visibleRows is , considering vertical padding, The maximum number of rows that can be viewed,
        // verticalPadding is vertical padding (top padding + bottom padding) in monitor screen (px);
        let visibleRows =  Math.floor(primary.height * (1 - MONITOR_VERTICAL_PADDING_RATIO) / this._rowHeight);
        let verticalPadding = primary.height - (visibleRows * this._rowHeight +
                                            (popupVerticalPadding + switcherPadding) +
                                            (visibleRows - 1) * switcherVerticalSpacing
        );


        let topPadding = Math.ceil(verticalPadding / 2);
        let bottomPadding = Math.ceil(verticalPadding / 2);

        // Allocate the switcherList
        // We select a size based on an icon size that does not overflow the screen
        let [, childNaturalHeight] = this._switcherList.get_preferred_height(primary.width - horizontalPadding);
        let [, childNaturalWidth] = this._switcherList.get_preferred_width(childNaturalHeight);

        childBox.x1 = Math.floor(primary.x + (primary.width - childNaturalWidth) / 2);
        childBox.x2 = Math.ceil(childBox.x1 + childNaturalWidth);

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
        else if (keysym === Clutter.KEY_Down || keysym === Clutter.KEY_Up)
            this._select(this._moveLine(keysym));
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

    // When Clutter.Key.Down pressed, Move Focus below the focused item.
    // If selected item is allocated Bottom Row, then move focus Top Row item
    // When Clutter.Key.Up pressed, Move Focus above the focused item.
    // If selected item is allocated Top Row, then move focus Bottom Row item
    _moveLine(keysym) {
        return this._switcherList.findVerticalItemIndex(this._selectedIndex, keysym);
    }
});

var WindowIcon = GObject.registerClass(
class WindowIcon extends St.BoxLayout {
    _init(window, mode) {
        super._init({ style_class: 'alt-tab-app',
            vertical: true });

        this.window = window;

        // Title is 1st row. It consists Appicon and Window name.
        this._title =  new St.BoxLayout();
        this.add_child(this._title);

        // Preview can be a Window Clone or Appicon
        this.preview = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this.add_child(this.preview);

        // Label is window name
        this.label = new St.Label({ text: window.get_title(), style_class: 'tos-text-label' });

        let tracker = Shell.WindowTracker.get_default();
        this.app = tracker.get_window_app(window);

        let mutterWindow = this.window.get_compositor_private();
        let size;

        this.preview.destroy_all_children();

        // scaleFactor is used to resize preview widget.
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        // Set preview & appicon widget depending on the mode value
        switch (mode) {
        case AppIconMode.THUMBNAIL_ONLY:
            size = WINDOW_PREVIEW_SIZE;
            this.preview.add_child(_createWindowClone(mutterWindow, size * scaleFactor));
            break;

        case AppIconMode.BOTH:
            size = WINDOW_PREVIEW_SIZE;
            this.preview.add_child(_createWindowClone(mutterWindow, size * scaleFactor));

            if (this.app) {
                this._title.add_child(this._createAppIcon(this.app,
                    APP_ICON_SIZE_SMALL));
            }
            break;
        case AppIconMode.APP_ICON_ONLY:
            size = APP_ICON_SIZE;
            this.preview.add_child(this._createAppIcon(this.app, size));
        }
        // Set window name on title row
        this._title.add_child(this.label);

        let [width, height] = mutterWindow.get_size();
        let ratio = width / height;

        this.preview.set_size(size * ratio * scaleFactor, size * scaleFactor);
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
        super._init(false);

        this._rows = 0;

        this._rowList = new St.BoxLayout({ style_class: 'switcher-list-item-container',
            vertical: true,
            x_expand: true,
            y_expand: true });

        this._scrollView.remove_actor(this._list);
        this._scrollView.add_actor(this._rowList);
        this._rowList.add_child(this._list);

        this._lists = [];
        this._lists.push(this._list);


        this.windows = windows;
        this.icons = [];

        let primary = Main.layoutManager.primaryMonitor;
        this._maxWidth = primary.width * (1 - MONITOR_HORIZON_PADDING_RATIO);

        for (let i = 0; i < windows.length; i++) {
            let win = windows[i];
            let icon = new WindowIcon(win, mode);
            let rowWidth = this.precalculateRowWidth(this._rows);

            if (rowWidth + icon.preview.get_width() > this._maxWidth) {
                this._rows++;
                let newRow = new St.BoxLayout({ style_class: 'switcher-list-item-container',
                    vertical: false,
                    x_expand: true,
                    y_expand: true });
                this._rowList.add_actor(newRow);
                this._lists.push(newRow);
            }

            this.addItem(icon, icon.label);

            this.icons.push(icon);

            this._items[i].set_width(this.icons[i].preview.get_width());
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

    vfunc_get_preferred_width(forHeight) {
        let themeNode = this.get_theme_node();
        let [maxChildMin] = this._maxChildWidth(forHeight);
        let [minListWidth] = this._lists[0].get_preferred_width(forHeight);

        for (let i = 1; i <= this._rows; i++) {
            let [newListWidth] = this._lists[i].get_preferred_width(forHeight);
            minListWidth = Math.max(minListWidth, newListWidth);
        }

        return themeNode.adjust_preferred_width(maxChildMin, minListWidth);
    }

    vfunc_get_preferred_height(forWidth) {
        let [minHeight, natHeight] = super.vfunc_get_preferred_height(forWidth);

        return [minHeight, (this._rows + 1) * natHeight];
    }

    vfunc_allocate(box) {
        super.vfunc_allocate(box);
    }

    precalculateRowWidth(index) {
        let rowButtons = this._lists[index].get_children();
        let rowButtonNum = rowButtons.length;
        let rowWidth = 0;
        for (let i = 0; i < rowButtonNum; i++) {
            rowWidth += rowButtons[i].get_width();
            rowWidth += BUTTON_PADDING * 2;
        }
        rowWidth += (rowButtonNum - 1) * ROW_SPACING;
        return rowWidth;
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

    // Find and return row index which include this._items[index]
    _findRowIndexFromItem(itemIndex) {
        let rowIndex = -1;
        for (let i = 0; i <= this._rows; i++) {
            if (this._lists[i].get_children().indexOf(this._items[itemIndex]) !== -1) {
                rowIndex = i;
                break;
            }
        }
        return rowIndex;
    }

    /* FindVerticalItemIndex
    Find Vertically moved ItemIndex logic are as follows
    1. Calculate center x-coordinate of previously selected item
    2. Find below or above Row Index, if there are overflow or underflow, adjust top or bottom accordingly
    3-1. if any item contains the calculated x-coordinate (1.), Return the index of that item
    3-2. ir there are no item that contains the calculated x-coordinate, Return the index of the closest item.
    */
    findVerticalItemIndex(itemIndex, keysym) {
        let itemIndexReturn = -1;
        let itemAllocation = this._items[itemIndex].allocation;
        let xMark = Math.floor((itemAllocation.x1 + itemAllocation.x2) / 2);

        let rowIndex = this._findRowIndexFromItem(itemIndex);
        let verticalIndex;
        if (keysym === Clutter.KEY_Down)
            verticalIndex = (rowIndex + 1) % (this._rows + 1);
        else if (keysym === Clutter.KEY_Up)
            verticalIndex = (rowIndex + this._rows) % (this._rows + 1);


        let rowItemList = this._lists[verticalIndex].get_children();
        let minDistance = -1;

        for (let i = 0; i < rowItemList.length; i++) {
            let candidateAllocation = rowItemList[i].allocation;
            if (candidateAllocation.x1 <= xMark && candidateAllocation.x2 >= xMark)
                return this._items.indexOf(rowItemList[i]);

            if (minDistance < 0) {
                minDistance = Math.min(Math.abs(candidateAllocation.x1 - xMark), Math.abs(candidateAllocation.x2 - xMark));
                itemIndexReturn = i;
            } else {
                let newDistance = Math.min(Math.abs(candidateAllocation.x1 - xMark), Math.abs(candidateAllocation.x2 - xMark));
                if (minDistance > newDistance) {
                    minDistance  = newDistance;
                    itemIndexReturn = i;
                }
            }
        }
        return this._items.indexOf(rowItemList[itemIndexReturn]);
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

        // Find row boxlayout which index items belongs to
        let rowIndex = this._findRowIndexFromItem(index);
        let [absItemX_, absItemY] = this._items[index].get_transformed_position();
        this.transform_stage_point(absItemX_, absItemY);
        let [containerWidth_, containerHeight] = this.get_transformed_size();

        if (this._lists[rowIndex].allocation.y2 > containerHeight)
            this._scrollToDown(index);
        else if (this._lists[rowIndex].allocation.y1 - value < 0)
            this._scrollToUp(index);
    }

    _scrollToUp(index) {
        let adjustment = this._scrollView.vscroll.adjustment;
        let [value, lower_, upper, stepIncrement_, pageIncrement_, pageSize] = adjustment.get_values();

        let rowIndex = this._findRowIndexFromItem(index);
        let list = this._lists[rowIndex];

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

        let rowIndex = this._findRowIndexFromItem(index);
        let list = this._lists[rowIndex];

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

    _rearrangeGrid(rowIndex) {
        if (rowIndex === this._rows)
            return;
        let nextRowItem = this._lists[rowIndex + 1].get_first_child();
        let rowWidth = this.precalculateRowWidth(rowIndex);

        if (rowWidth + nextRowItem.get_width() < this._maxWidth) {
            this._lists[rowIndex + 1].remove_actor(nextRowItem);
            this._lists[rowIndex].add_actor(nextRowItem);
            this._rearrangeGrid(rowIndex + 1);
        }
    }

    _removeWindow(window) {
        let index = this.icons.findIndex(icon => {
            return icon.window === window;
        });
        if (index === -1)
            return;
        let rowIndex = this._findRowIndexFromItem(index);
        this.icons.splice(index, 1);
        this.removeItem(index);
        this._rearrangeGrid(rowIndex);
        for (let i = this._rows; i >= 0; i--) {
            if (this._lists[i].get_children().length === 0) {
                this._rowList.remove_child(this._lists[i]);
                this._lists.splice(i, 1);
                this._rows--;
            } else {
                break;
            }
        }
    }
});
