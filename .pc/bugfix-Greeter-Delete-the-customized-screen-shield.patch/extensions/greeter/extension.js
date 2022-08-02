/*
 * Greeter - login screen for GNOME Shell
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

const Main = imports.ui.main;
const LoginManager = imports.misc.loginManager;
const _ = imports.gettext.gettext;

const ScreenShield = Me.imports.screenShield;

function init(/* metadata*/) { // eslint-disable-line no-unused-vars
}

function _invalidateOldScreenShield() {
    // Invalidate objects used in previous screenshield
    let screenSaverDBus = Main.screenShield._screenSaverDBus;
    screenSaverDBus._dbusImpl.unexport();
    Main.screenShield._presence = null;
    Main.screenShield._screenSaverDBus = null;
    Main.screenShield._smartcardManager = null;
    Main.screenShield._oVirtCredentialsManager = null;
    Main.screenShield._loginManager = null;
    Main.screenShield._loginSession = null;
}

function _enableNetworkSettings() {
    // NOTE(210803, sohee): Receives 'startup-complete' signal
    // to customize the panel network menus after completing gnome-shell panel network setup.
    Main.layoutManager.connect('startup-complete', () => {
        // add 'network setting' menu item
        let network = Main.panel.statusArea['aggregateMenu']._network;
        let deviceSection = network.menu.firstMenuItem.section;
        let statusItem = deviceSection.firstMenuItem;
        let networkSettingsItem = statusItem.menu.addSettingsAction(
            _('Network Settings'), 'nm-connection-editor.desktop');
        networkSettingsItem.visible = true;

        // enable network section of panel
        network.menu.setSensitive(true);
    });
}

function enable() { // eslint-disable-line no-unused-vars
    if (!Main.sessionMode.isGreeter)
        return;

    if (!LoginManager.canLock())
        return;

    _invalidateOldScreenShield();

    // Replace with custom ScreenShield and LoginDialog
    Main.screenShield = new ScreenShield.ScreenShield();
    Main.screenShield.ensureLoginDialog();

    _enableNetworkSettings();
}

function disable() { // eslint-disable-line no-unused-vars
}
