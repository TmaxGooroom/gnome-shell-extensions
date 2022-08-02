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

const { Clutter, St, Shell } = imports.gi;
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
            vertical: true,
        });
        this.frequentAppsBox.style = 'background-color: rgb(237, 237, 242); height: 180px; border-radius: 14px 14px 0px 0px';

        this.recentFilesBox = new St.BoxLayout({
            vertical: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
        });
        this.recentFilesBox.style = 'background-color: rgb(255, 255, 255); border-radius: 0px 0px 14px 14px; width: 662px; height: 370px;';

        this.defaultBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
            vertical: true,
        });

        this.defaultBox.add_actor(this.frequentAppsBox);
        this.defaultBox.add_actor(this.recentFilesBox);
        this.subMainBox.add_actor(this.defaultBox);

        // Search Result View
        this.resultBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.resultBox.style = 'width: 300px; background-color: transparent; color: rgb(0, 0 ,0); border-radius: 14px 0px 0px 14px;';
        this.resultScrollBox = this._createScrollBox({
            y_align: Clutter.ActorAlign.FILL,
            overlay_scrollbars: true,
        });
        this.resultScrollBox.style = 'background-color:rgb(255, 255, 255); border-radius: 14px 0px 0px 14px;';
        this.resultScrollBox.add_actor(this.resultBox);
        this.subMainBox.add(this.resultScrollBox);

        // Search Detail View
        this.detailBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.detailBox.style = 'width: 362px; height: 550px; background-color: rgb(237, 237, 242); color: rgb(0, 0 ,0); border-radius: 0px 14px 14px 0px;';
        this.subMainBox.add(this.detailBox);

        this._loadRecentFiles();
        this.setDefaultMenuView();
    }

    createDefaultView() {
        this.createFrequentAppsView();
        this.createRecentFilesView();
    }

    createFrequentAppsView() {
        // Frequent Apps
        // Label
        let labelString = _('Frequently Used Apps');
        let frequentAppsLabel = new PopupMenu.PopupMenuItem(labelString);
        frequentAppsLabel.label.style = 'font-weight: bold; font-size: 16px; color: rgb(0, 0, 0); margin-top: 14px;';
        this.frequentAppsBox.add_actor(frequentAppsLabel.actor);

        this.frequentAppItemsBox = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
        });
        this.frequentAppItemsBox.style = 'spacing: 30px; margin-top: 10px;';
        this.frequentAppsBox.add_actor(this.frequentAppItemsBox);

        let mostUsed = Shell.AppUsage.get_default().get_most_used();
        this.frequentAppsList = [];
        for (let i = 0; i < mostUsed.length; i++) {
            if (mostUsed[i] && mostUsed[i].get_app_info().should_show()) {
                let item = new MW.FrequentAppItem(this, mostUsed[i]);
                this.frequentAppsList.push(item);
            }

            if (this.frequentAppsList.length === 6)
                break;

        }

        for (let i = 0; i < this.frequentAppsList.length; i++) {
            let item = this.frequentAppsList[i];
            this.frequentAppItemsBox.add_actor(item.actor);
        }
    }

    createRecentFilesView() {
        // Recent Files
        // Label
        let labelString = _('Recent Records');
        let recentFilesLabel = new PopupMenu.PopupMenuItem(labelString);
        recentFilesLabel.label.style = 'font-weight: bold; font-size: 16px; color: rgb(0, 0, 0); margin-top: 14px; margin-bottom: 14px;';
        this.recentFilesBox.add_actor(recentFilesLabel.actor);

        // Recent File Items
        this.recentFileItemsBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.recentFilesBox.add_actor(this.recentFileItemsBox);

        this.displayRecentFiles();
    }
};
