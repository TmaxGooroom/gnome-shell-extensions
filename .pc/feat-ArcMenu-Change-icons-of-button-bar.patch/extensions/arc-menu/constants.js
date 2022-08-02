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
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var CategoryType = {
    FAVORITES: 0,
    FREQUENT_APPS: 1,
    ALL_PROGRAMS: 2,
    PINNED_APPS: 3,
    RECENT_FILES: 4,
    HOME_SCREEN: 5,
    CATEGORIES_LIST: 6,
    CATEGORY_APP_LIST: 7,
    ALL_PROGRAMS_BUTTON: 8,
};

var DefaultMenuView = {
    PINNED_APPS: 0,
    CATEGORIES_LIST: 1,
    FREQUENT_APPS: 2
}

var SoftwareManagerIDs = ['org.manjaro.pamac.manager.desktop', 'pamac-manager.desktop', 'io.elementary.appcenter.desktop',
                            'snap-store_ubuntu-software.desktop', 'snap-store_snap-store.desktop', 'org.gnome.Software.desktop'];

var CATEGORIES = [
    {Category: CategoryType.FAVORITES, Name: _("Favorites"), Icon: 'emblem-favorite-symbolic'},
    {Category: CategoryType.FREQUENT_APPS, Name: _("Frequent Apps"), Icon: 'user-bookmarks-symbolic'},
    {Category: CategoryType.ALL_PROGRAMS, Name: _("All Programs"), Icon: 'view-grid-symbolic'},
    {Category: CategoryType.PINNED_APPS, Name: _("Pinned Apps"), Icon: Me.path + '/media/icons/menu_icons/arc-menu-symbolic.svg'},
    {Category: CategoryType.RECENT_FILES, Name: _("Recent Files"), Icon: 'document-open-recent-symbolic'}
]

var TooltipLocation = {
    TOP_CENTERED: 0,
    BOTTOM_CENTERED: 1,
    BOTTOM: 2,
};

var SEPARATOR_ALIGNMENT = {
    VERTICAL: 0,
    HORIZONTAL: 1
};

var MenuItemType = {
    BUTTON: 0,
    MENU_ITEM: 1
};

var SEPARATOR_STYLE = {
    NORMAL: 0,
    LONG: 1,
    SHORT: 2,
    MAX: 3,
};

var SUPER_L = 'Super_L';
var SUPER_R = 'Super_R';
var EMPTY_STRING = '';

var HOT_KEY = {
    Undefined: 0,
    Super_L: 1,
    Super_R: 2,
    Custom: 3,
    // Inverse mapping
    0: EMPTY_STRING,
    1: SUPER_L,
    2: SUPER_R,
};

var HOT_CORNERS_ACTION = {
    Default: 0,
    Disabled: 1,
    ToggleArcMenu: 2,
    Custom: 3
}

var MENU_POSITION = {
    Left: 0,
    Center: 1,
    Right: 2
};

var PowerType = {
    POWEROFF: 1,
    LOCK: 2,
    LOGOUT: 3,
    SUSPEND: 4,
    RESTART: 5
};

var MENU_BUTTON_ICONS_PATH = '/media/icons/tos_desktop_ic_dock_tmax .svg';

// Path to some files
var RESTART_ICON = {
    Path: '/media/icons/menu_icons/restart-symbolic.svg'
};

var DEVELOPERS = '<b>Andrew Zaech</b> <a href="https://gitlab.com/AndrewZaech">@AndrewZaech</a>\nLead Project Developer and Maintainer\t' +
                '\n\n<b>LinxGem33</b> aka <b>Andy C</b> <a href="https://gitlab.com/LinxGem33">@LinxGem33</a> - <b>(Inactive)</b>\nArcMenu Founder - Former Maintainer - Former Digital Art Designer';
var TRANSLATORS = '<b>Thank you to all translators!</b>\n<a href="https://gitlab.com/arcmenu/ArcMenu#please-refer-to-the-wiki-section-for-a-translation-guide">Full List of Translators</a>';
var CONTRIBUTORS = '<b>Thank you to the following Top Contributors:</b>\n<a href="https://gitlab.com/arcmenu/ArcMenu#top-project-contributors">Top Contributors</a>' +
                    '\n\n<b>A thank you to those who submited Pull Requests</b>\n<a href="https://gitlab.com/arcmenu/ArcMenu#pull-requests">Pull Request Contributors</a>';
var ARTWORK = '<b>LinxGem33</b> aka <b>Andy C</b>\nWiki Screens, Icons, Wire-Frames, ArcMenu Assets' +
                '\n\n<b>Andrew Zaech</b>\nIcons, Wire-Frames';

var GNU_SOFTWARE = '<span size="small">' +
    'This program comes with absolutely no warranty.\n' +
    'See the <a href="https://gnu.org/licenses/old-licenses/gpl-2.0.html">' +
	'GNU General Public License, version 2 or later</a> for details.' +
	'</span>';
