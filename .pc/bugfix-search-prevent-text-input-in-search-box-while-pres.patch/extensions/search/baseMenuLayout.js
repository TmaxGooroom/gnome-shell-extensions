/*
 * ArcMenu - A traditional application menu for GNOME 3
 *
 * ArcMenu Lead Developer and Maintainer
 * Andrew Zaech https://gitlab.com/AndrewZaech
 *
 * ArcMenu Founder, Former Maintainer, and Former Graphic Designer
 * LinxGem33 https://gitlab.com/LinxGem33 - (No Longer Active)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, St, Gtk, GLib, Gio } = imports.gi;
const ArcSearch = Me.imports.search;
const MW = Me.imports.menuWidgets;
const Utils =  Me.imports.utils;

// This class handles the core functionality of all the menu layouts.
// Each menu layout extends this class.
var BaseLayout = class { // eslint-disable-line no-unused-vars
    constructor(menuButton) {
        this.menuButton = menuButton;
        this._settings = menuButton._settings;
        this.mainBox = menuButton.mainBox;
        this.contextMenuManager = menuButton.contextMenuManager;
        this.searchMenu = menuButton.searchMenu;
        this.isRunning = true;
        this._focusChild = null;
        this.newSearch = new ArcSearch.SearchResults(this);

        this._mainBoxKeyPressId = this.mainBox.connect('key-press-event', this._onMainBoxKeyPress.bind(this));

        this.mainBox.vertical = false;
        this.createSearchBox();
        this.createLayout();
        this.updateStyle();
    }

    resetSearch() {
        this.searchBox.clear();
        this.setDefaultMenuView();
    }

    setDefaultMenuView() {
        this.searchBox.clear();
        this.newSearch._reset();

        this.resultScrollBox.hide();
        this.detailBox.hide();

        // refresh (clear an existing items and replace it with a new one)
        this.clearActorsFromBox(this.frequentAppItemsBox);
        this.clearActorsFromBox(this.frequentAppsBox);
        this.clearActorsFromBox(this.recentFileItemsBox);
        this.clearActorsFromBox(this.recentFilesBox);

        this.createDefaultView();
        this.defaultBox.show();
    }

    reload() {
        let isReload = true;
        this.destroy(isReload);
        this.newSearch = new ArcSearch.SearchResults(this);
        this.createLayout();
        this.updateStyle();
    }

    updateStyle() {
        this.searchBox.updateStyle();
        this.newSearch.setStyle('');
        this.searchBox._stEntry.remove_style_class_name('arc-search-entry');
        this.searchBox._stEntry.add_style_class_name('default-search-entry');

        if (this.actionsBox) {
            this.actionsBox.get_children().forEach(actor => {
                if (actor instanceof St.Button)
                    actor.remove_style_class_name('arc-menu-action');

            });
        }
    }

    setActiveCategory(category, setActive = true) {
        this.activeMenuItem = category;
        if (setActive && this.searchMenu.isOpen)
            this.activeMenuItem.actor.grab_key_focus();
        else if (this.searchMenu.isOpen)
            this.mainBox.grab_key_focus();
    }

    clearActorsFromBox(box) {
        if (!box)
            box = this.resultBox;

        let parent = box.get_parent();
        if (parent instanceof St.ScrollView) {
            let scrollBoxAdj = parent.get_vscroll_bar().get_adjustment();
            scrollBoxAdj.set_value(0);
        }
        let actors = box.get_children();
        for (let i = 0; i < actors.length; i++) {
            let actor = actors[i];
            box.remove_actor(actor);
        }
    }

    _onSearchBoxKeyPress(searchBox, event) {
        let symbol = event.get_key_symbol();
        if (!searchBox.isEmpty() && searchBox.hasKeyFocus()) {
            if (symbol === Clutter.KEY_Up) {
                this.newSearch.highlightDefault(false);
                return this._onMainBoxKeyPress(this.mainBox, event);
            } else if (symbol === Clutter.KEY_Down) {
                this.newSearch.highlightDefault(false);
                return this._onMainBoxKeyPress(this.mainBox, event);
            } else if (symbol === Clutter.KEY_Return ||
                       symbol === Clutter.KEY_KP_Enter) {
                return this._onMainBoxKeyPress(this.mainBox, event);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onSearchBoxKeyFocusIn(searchBox) {
        if (!searchBox.isEmpty())
            this.newSearch.highlightDefault(false);
    }

    _onSearchBoxChanged(searchBox, searchString) {
        if (searchBox.isEmpty()) {
            this.newSearch.setTerms(['']);
            this.setDefaultMenuView();
            this.newSearch.actor.hide();
        } else {
            this.defaultBox.hide();

            // refresh (clear an existing items and replace it with a new one)
            this.clearActorsFromBox(this.resultBox);

            let resultScrollBoxAdj = this.resultScrollBox.get_vscroll_bar().get_adjustment();
            resultScrollBoxAdj.set_value(0);

            this.resultBox.add(this.newSearch.actor);

            this.resultScrollBox.show();
            this.detailBox.show();

            this.newSearch.actor.show();
            this.newSearch.setTerms([searchString]);
            this.newSearch.highlightDefault(true);
        }
    }

    _onMainBoxKeyPress(actor, event) {
        if (event.has_control_modifier()) {
            if (this.searchBox)
                this.searchBox.grabKeyFocus();
            return Clutter.EVENT_PROPAGATE;
        }

        // To prevent search while pressing modifier other than shift
        let state = event.get_state();
        if (state) {
            if (state & ~Clutter.ModifierType.SHIFT_MASK)
                return Clutter.EVENT_STOP;
        }

        let symbol = event.get_key_symbol();
        let key = event.get_key_unicode();

        switch (symbol) {
        case Clutter.KEY_BackSpace:
            if (this.searchBox) {
                if (!this.searchBox.hasKeyFocus() && !this.searchBox.isEmpty()) {
                    this.searchBox.grabKeyFocus();
                    let newText = this.searchBox.getText().slice(0, -1);
                    this.searchBox.setText(newText);
                }
            }
            return Clutter.EVENT_PROPAGATE;
        case Clutter.KEY_Tab:
        case Clutter.KEY_KP_Tab:
            return Clutter.EVENT_PROPAGATE;
        case Clutter.KEY_Up:
        case Clutter.KEY_Down:
        case Clutter.KEY_Left:
        case Clutter.KEY_Right: {
            let direction;
            if (symbol === Clutter.KEY_Down)
                direction = St.DirectionType.DOWN;
            if (symbol === Clutter.KEY_Right)
                direction = St.DirectionType.RIGHT;
            if (symbol === Clutter.KEY_Up)
                direction = St.DirectionType.UP;
            if (symbol === Clutter.KEY_Left)
                direction = St.DirectionType.LEFT;

            if (this.searchBox.hasKeyFocus() && this.newSearch._defaultResult &&
                    this.newSearch.actor.get_parent()) {
                this.newSearch.highlightDefault(!this.newSearch._highlightDefault);
                this.newSearch._defaultResult.actor.grab_key_focus();
                if (this.newSearch._highlightDefault)
                    return Clutter.EVENT_STOP;
                return actor.navigate_focus(global.stage.key_focus, direction, false);
            } else if (global.stage.key_focus === this.mainBox ||
                         global.stage.key_focus === this.searchBox.actor) {
                this.activeMenuItem.actor.grab_key_focus();
                return Clutter.EVENT_PROPAGATE;
            }
            return actor.navigate_focus(global.stage.key_focus, direction, false);
        }
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
            if (!this.searchBox.isEmpty()) {
                if (this.newSearch.getTopResult())
                    this.newSearch.getTopResult().activate(event);

            }
            return Clutter.EVENT_PROPAGATE;
        case Clutter.KEY_Escape:
            return Clutter.EVENT_PROPAGATE;
        default:
            if (key.length !== 0) {
                if (this.searchBox) {
                    this.searchBox.grabKeyFocus();
                    let newText = this.searchBox.getText() + key;
                    this.searchBox.setText(newText);
                }
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    destroy(isReload) {
        if (this.newSearch)
            this.newSearch.destroy();


        if (!isReload) {
            if (this._searchBoxChangedId > 0) {
                this.searchBox.disconnect(this._searchBoxChangedId);
                this._searchBoxChangedId = 0;
            }
            if (this._searchBoxKeyPressId > 0) {
                this.searchBox.disconnect(this._searchBoxKeyPressId);
                this._searchBoxKeyPressId = 0;
            }
            if (this._searchBoxKeyFocusInId > 0) {
                this.searchBox.disconnect(this._searchBoxKeyFocusInId);
                this._searchBoxKeyFocusInId = 0;
            }

            if (this._mainBoxKeyPressId > 0) {
                this.mainBox.disconnect(this._mainBoxKeyPressId);
                this._mainBoxKeyPressId = 0;
            }

            this.isRunning = false;
        }

        this.mainBox.get_children().forEach(child => {
            if (child && child !== undefined && child !== null)
                child.destroy();
        });
    }

    _createScrollBox(params) {
        let scrollBox = new MW.ScrollView(params);
        let panAction = new Clutter.PanAction({ interpolate: false });
        panAction.connect('pan', action => {
            this._blockActivateEvent = true;
            this.onPan(action, scrollBox);
        });
        panAction.connect('gesture-cancel', action => this.onPanEnd(action, scrollBox));
        panAction.connect('gesture-end', action => this.onPanEnd(action, scrollBox));
        scrollBox.add_action(panAction);

        scrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scrollBox.clip_to_allocation = true;

        return scrollBox;
    }

    _keyFocusIn(actor) {
        if (this._focusChild === actor)
            return;
        this._focusChild = actor;
        Utils.ensureActorVisibleInScrollView(actor);
    }

    onPan(action, scrollbox) {
        let [dist_, dx_, dy] = action.get_motion_delta(0);
        let adjustment = scrollbox.get_vscroll_bar().get_adjustment();
        adjustment.value -=  dy;
        return false;
    }

    onPanEnd(action, scrollbox) {
        let velocity = -action.get_velocity(0)[2];
        let adjustment = scrollbox.get_vscroll_bar().get_adjustment();
        let endPanValue = adjustment.value + velocity * 2;
        adjustment.value = endPanValue;
    }

    createRecentFileItem(menuItemArray) {
        let placeInfo, placeMenuItem;
        let fileUri = menuItemArray[2];
        placeInfo = new MW.PlaceInfo(
            Gio.File.new_for_uri(fileUri), menuItemArray[0], menuItemArray[1]);
        placeMenuItem = new MW.PlaceMenuItem(this, placeInfo);
        placeMenuItem.y_align = Clutter.ActorAlign.START;

        return placeMenuItem;
    }

    _loadRecentFiles() {
        if (!this.recentManager)
            this.recentManager = new Gtk.RecentManager();

        this._recentFiles = this.recentManager.get_items();

        if (!this._recentFilesChangedID) {
            this._recentFilesChangedID = this.recentManager.connect('changed', () => {
                this.needsReload = true;
            });
        }
    }

    displayRecentFiles() {
        const homeRegExp = new RegExp(`^(${GLib.get_home_dir()})`);
        for (let i = 0; i < 6; i++) {
            if (i > this._recentFiles.length - 1)
                break;

            let fileUri = this._recentFiles[i].get_uri();
            let name = this._recentFiles[i].get_display_name();
            let icon = Gio.content_type_get_symbolic_icon(this._recentFiles[i].get_mime_type()).to_string();
            let recentFileItem = this.createRecentFileItem([name, icon, fileUri]);
            recentFileItem.description = this._recentFiles[i].get_uri_display().replace(homeRegExp, '~');
            recentFileItem.fileUri = fileUri;
            this.recentFileItemsBox.add_actor(recentFileItem);
        }
    }
};
