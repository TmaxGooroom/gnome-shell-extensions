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

const { Clutter, St } = imports.gi;
const BaseMenuLayout = Me.imports.baseMenuLayout;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const MW = Me.imports.menuWidgets;
const PopupMenu = imports.ui.popupMenu;
const _ = Gettext.gettext;

var createMenu = class extends BaseMenuLayout.BaseLayout { // eslint-disable-line no-unused-vars
    constructor(mainButton) {
        super(mainButton);
        this.searchMenu = mainButton.searchMenu;
    }

    createSearchBox() {
        // Search Box
        this.searchBox = new MW.SearchBox(this);
        this._searchBoxChangedId = this.searchBox.connect('changed', this._onSearchBoxChanged.bind(this));
        this._searchBoxKeyPressId = this.searchBox.connect('key-press-event', this._onSearchBoxKeyPress.bind(this));
        this._searchBoxKeyFocusInId = this.searchBox.connect('key-focus-in', this._onSearchBoxKeyFocusIn.bind(this));
    }

    createLayout() {
        this.subMainBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
            vertical: false,
        });
        this.subMainBox.style = 'width: 662px;';
        this.mainBox.add(this.subMainBox);

        // Default View
        this.frequentAppsBox = new St.BoxLayout({
            vertical: false,
        });

        this.recentFilesBox = new St.BoxLayout({
            vertical: false,
        });
        this.recentFilesScrollBox = this._createScrollBox({
            y_align: Clutter.ActorAlign.START,
            overlay_scrollbars: true,
        });
        this.recentFilesScrollBox.add_actor(this.recentFilesBox);

        this.defaultBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
            vertical: true,
        });

        this.defaultBox.add_actor(this.frequentAppsBox);
        this.defaultBox.add_actor(this.recentFilesScrollBox);
        this.subMainBox.add_actor(this.defaultBox);

        // Search Result View
        this.resultBox = new St.BoxLayout({
            vertical: true,
        });
        this.resultScrollBox = this._createScrollBox({
            y_align: Clutter.ActorAlign.START,
            overlay_scrollbars: true,
        });
        this.resultScrollBox.style = 'width: 300px;';
        this.resultScrollBox.add_actor(this.resultBox);
        this.subMainBox.add(this.resultScrollBox);

        // Search Detail View
        this.detailBox = new St.BoxLayout({
            vertical: true,
        });
        this.detailScrollBox = this._createScrollBox({
            y_align: Clutter.ActorAlign.START,
            overlay_scrollbars: true,
        });
        this.detailScrollBox.style = 'width: 362px; height: 400px;';
        this.detailScrollBox.add_actor(this.detailBox);
        this.subMainBox.add(this.detailScrollBox);

        this.setDefaultMenuView();
    }

    createDefaultLabel() {
        let labelString = '검색어를 입력하세요';
        let defaultLabel = new PopupMenu.PopupMenuItem(labelString);
        defaultLabel.label.style = 'font-weight: bold; font-size: 16px;';
        this.frequentAppsBox.add_actor(defaultLabel.actor);
    }
};
