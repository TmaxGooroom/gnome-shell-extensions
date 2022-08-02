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

const SessionMode = imports.ui.sessionMode;

let _startupCompleteSignalId = 0;
let _sessionModeUpdatedSignalId = 0;

function init(/* metadata*/) { // eslint-disable-line no-unused-vars
}

function _enableNetworkSettings() {
    // enable network section of panel
    let network = Main.panel.statusArea['aggregateMenu']._network;
    network.menu.setSensitive(true);

    let wiredSection = network._devices['wired'];
    if (!wiredSection.getSensitive())
        return;

    let deviceSection = wiredSection.section;
    let deviceStatusItem = deviceSection.firstMenuItem;
    if (!deviceStatusItem)
        return;

    // add 'network setting' menu item
    let networkSettingsItem = deviceStatusItem.menu._settingsActions['nm-connection-editor.desktop'];
    if (!networkSettingsItem) {
        let item = deviceStatusItem.menu.addSettingsAction(
            _('Network Settings'), 'nm-connection-editor.desktop');
        item.visible = true;
    } else {
        networkSettingsItem.visible = true;
    }
}

function _connectSessionUpdatedSignal() {
    if (_sessionModeUpdatedSignalId !== 0)
        return;

    _sessionModeUpdatedSignalId = Main.sessionMode.connect('updated', () => {
        let currentMode = Main.sessionMode.currentMode;
        if (currentMode === 'tos') {
            // When logging in from the lock screen,
            // all session mode parameters(including unlockDialog) are initialized.
            // Therefore, if session mode is tos, the unlockDialog must be reset.
            Main.sessionMode.unlockDialog = Me.imports.unlockDialog.UnlockDialog;
        }
    });
}

function enable() { // eslint-disable-line no-unused-vars
    if (!LoginManager.canLock())
        return;

    if (Main.sessionMode.isGreeter) {
        // In order to display the network setting window above the login screen,
        // change the screen shield group layer.
        let ssg = Main.screenShield.actor;
        let uiGroup = Main.layoutManager.uiGroup;
        if (uiGroup.contains(ssg)) {
            Main.layoutManager.removeChrome(ssg);
            Main.layoutManager._backgroundGroup.add_child(ssg);
        }

        Main.screenShield._becomeModal = () => {
            return true;
        };

        Main.sessionMode.unlockDialog = Me.imports.loginDialog.LoginDialog;

        // NOTE(210803, sohee): Receives 'startup-complete' signal
        // to customize the panel network menus after completing gnome-shell panel network setup.
        if (_startupCompleteSignalId !== 0)
            return;

        _startupCompleteSignalId = Main.layoutManager.connect('startup-complete', () => {
            _enableNetworkSettings();
        });

    } else {
        // unlock dialog mode settings
        let params = SessionMode._modes['unlock-dialog'];
        params.allowExtensions = true;
        params.hasWindows = true;
        params.enabledExtensions = ['greeter@tmax-shell-extensions', 'osk-hangul@tmax-shell-extensions'];

        Main.sessionMode.unlockDialog = Me.imports.unlockDialog.UnlockDialog;

        if (Main.sessionMode.currentMode === 'tos')
            _connectSessionUpdatedSignal();
    }
}

function disable() { // eslint-disable-line no-unused-vars
}
