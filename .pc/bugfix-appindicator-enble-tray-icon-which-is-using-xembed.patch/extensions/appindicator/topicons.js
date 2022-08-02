// This file is part of the AppIndicator/KStatusNotifierItem GNOME Shell extension
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

/* exported createTray, destroyTray */

const Shell = imports.gi.Shell;
const Main = imports.ui.main;
const System = imports.system;

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const IndicatorStatusIcon = Me.imports.indicatorStatusIcon;

let tray = null;
let icons = [];
let trayAddedId = 0;
let trayRemovedId = 0;

function createTray() {
    tray = new Shell.TrayManager();
    trayAddedId = tray.connect('tray-icon-added', onTrayIconAdded);
    trayRemovedId  = tray.connect('tray-icon-removed', onTrayIconRemoved);

    tray.manage_screen(Main.panel);
}

function onTrayIconAdded(o, icon, role, unusedDelay = 1000) {
    const topIcon = new IndicatorStatusIcon.IndicatorStatusTopIcon(icon);

    icon.connect('button-release-event', (actor, event) => {
        icon.click(event);
    });

    icon.reactive = true;
    icons.push(topIcon);
}

function onTrayIconRemoved(o, icon) {
    let index = -1;
    for (let i = 0; i < icons.length; i++) {
        if (icons[i].getIcon() === icon) {
            index = i;
            break;
        }
    }

    if (index === -1)
        return;

    icons[index].destroy();
    icons.splice(index, 1);
}

function destroyTray() {
    for (let i = 0; i < icons.length; i++)
        icons[i].destroy();

    tray.disconnect(trayAddedId);
    tray.disconnect(trayRemovedId);

    icons = [];

    tray = null;
    System.gc(); // force finalizing tray to unmanage screen
}
