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
        // Search Result Box
        this.applicationsBox = new St.BoxLayout({
            vertical: true,
        });
        this.applicationsScrollBox = this._createScrollBox({
            y_align: Clutter.ActorAlign.START,
            overlay_scrollbars: true,
            style_class: 'small-vfade',
        });
        this.applicationsScrollBox.style = 'width: 380px;';
        this.applicationsScrollBox.add_actor(this.applicationsBox);
        this.mainBox.add(this.applicationsScrollBox);

        this.setDefaultMenuView();
        this.createDefaultLabel();
    }

    createDefaultLabel() {
        let labelString = '검색어를 입력하세요';
        let defaultLabel = new PopupMenu.PopupMenuItem(labelString);
        defaultLabel.label.style = 'font-weight: bold; font-size: 16px;';
        this.applicationsBox.add_actor(defaultLabel.actor);
    }
};
