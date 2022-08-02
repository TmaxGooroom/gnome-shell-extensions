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

function init(/* metadata*/) { // eslint-disable-line no-unused-vars
}

function _enableNetworkSettings() {
    // NOTE(210803, sohee): Receives 'startup-complete' signal
    // to customize the panel network menus after completing gnome-shell panel network setup.
    Main.layoutManager.connect('startup-complete', () => {
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
        let networkSettingsItem = deviceStatusItem.menu.addSettingsAction(
            _('Network Settings'), 'nm-connection-editor.desktop');
        networkSettingsItem.visible = true;
    });
}

function enable() { // eslint-disable-line no-unused-vars
    if (!LoginManager.canLock())
        return;

    if (Main.sessionMode.isGreeter) {
        Main.sessionMode.unlockDialog = Me.imports.loginDialog.LoginDialog;

        let screenShieldGroup = Main.screenShield.actor;
        Main.layoutManager.removeChrome(screenShieldGroup);
        Main.layoutManager._backgroundGroup.add_child(screenShieldGroup);

        Main.screenShield._becomeModal = () => {
            return true;
        };

        _enableNetworkSettings();
    } else {
        // unlock dialog mode settings
        let params = SessionMode._modes['unlock-dialog'];
        params.allowExtensions = true;
        params.enabledExtensions = ['greeter@tmax-shell-extensions', 'osk-hangul@tmax-shell-extensions'];

        // When logging in from the lock screen,
        // all session mode parameters(including unlockDialog) are initialized.
        // Therefore, if session mode is tos, the unlockDialog must be reset.
        Main.sessionMode.connect('updated', () => {
            let currentMode = Main.sessionMode.currentMode;
            if (currentMode !== 'tos')
                return;

            Main.sessionMode.unlockDialog = Me.imports.unlockDialog.UnlockDialog;
        });

        Main.sessionMode.unlockDialog = Me.imports.unlockDialog.UnlockDialog;
    }
}

function disable() { // eslint-disable-line no-unused-vars
}
