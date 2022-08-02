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

const { GObject, Shell } = imports.gi;

const Main = imports.ui.main;
const LoginManager = imports.misc.loginManager;
const _ = imports.gettext.gettext;

const SessionMode = imports.ui.sessionMode;
const PolkitAgent = imports.ui.components.polkitAgent;

let windowVisibilityMap = new Map();

let _startupCompleteSignalId = 0;
let _lockedChangedSignalId = 0;
let _sessionModeUpdatedSignalId = 0;

function init(/* metadata*/) { // eslint-disable-line no-unused-vars
}

function _getDeviceStatusItem() {
    let network = Main.panel.statusArea['aggregateMenu']._network;

    let wiredSection = network._devices['wired'];
    if (!wiredSection.getSensitive())
        return null;

    let deviceSection = wiredSection.section;
    let deviceStatusItem = deviceSection.firstMenuItem;

    return deviceStatusItem;
}

function _enableNetworkSettings() {
    // enable network section of panel
    let network = Main.panel.statusArea['aggregateMenu']._network;
    network.menu.setSensitive(true);

    let deviceStatusItem = _getDeviceStatusItem();
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

function _showNonNetworkWindows(visible) {
    let tracker = Shell.WindowTracker.get_default();
    let windows = global.get_window_actors();

    for (let i = 0; i < windows.length; i++) {
        let metaWindow = windows[i].metaWindow;
        let app = tracker.get_window_app(metaWindow);
        if (!app)
            continue;

        if (app.get_id() === 'nm-connection-editor.desktop')
            continue;

        if (visible) {
            let exist = windowVisibilityMap.has(metaWindow);
            if (!exist)
                continue;

            let wasVisible = windowVisibilityMap.get(metaWindow);
            if (wasVisible)
                metaWindow.unminimize();
        } else {
            windowVisibilityMap.set(metaWindow, !metaWindow.minimized);
            metaWindow.minimize();
        }
    }
}

function _showNetworkWindowsOnly() {
    _showNonNetworkWindows(false);
}

function _showAllWindows() {
    _showNonNetworkWindows(true);
}

function _connectSessionUpdatedSignal() {
    if (_sessionModeUpdatedSignalId !== 0)
        return;

    _sessionModeUpdatedSignalId = Main.sessionMode.connect('updated', () => {
        let currentMode = Main.sessionMode.currentMode;

        if (currentMode === 'unlock-dialog') {
            _showNetworkWindowsOnly();
        } else if (currentMode === 'tos') {
            // When logging in from the lock screen,
            // all session mode parameters(including unlockDialog) are initialized.
            // Therefore, if session mode is tos, the unlockDialog must be reset.
            Main.sessionMode.unlockDialog = Me.imports.unlockDialog.UnlockDialog;

            _showAllWindows();
            windowVisibilityMap.clear();
        }
    });
}

function _connectLockedChangedSignal() {
    if (_lockedChangedSignalId !== 0)
        return;

    _lockedChangedSignalId = Main.screenShield.connect('locked-changed', () => {
        let currentMode = Main.sessionMode.currentMode;
        if (currentMode === 'unlock-dialog') {
            _enableNetworkSettings();
        } else {
            let deviceStatusItem = _getDeviceStatusItem();
            if (!deviceStatusItem)
                return;

            let networkSettingsItem = deviceStatusItem.menu._settingsActions['nm-connection-editor.desktop'];
            if (networkSettingsItem)
                networkSettingsItem.visible = false;
        }
    });
}

var TosAuthenticationAgent = GObject.registerClass(
class TosAuthenticationAgent extends PolkitAgent.AuthenticationAgent {
    _onInitiate(nativeAgent, actionId, message, iconName, cookie, userNames) {
        if (Main.sessionMode.currentMode === 'unlock-dialog' &&
            actionId === 'org.freedesktop.NetworkManager.settings.modify.system') {
            this._currentDialog = new PolkitAgent.AuthenticationDialog(actionId, message, cookie, userNames);
            this._currentDialog.connect('done', this._onDialogDone.bind(this));
            return;
        }

        super._onInitiate(nativeAgent, actionId, message, iconName, cookie, userNames);
    }
});

function _replaceWithTosAuthenticationAgent() {
    // Remove old AuthenticationAgent
    let componentManager = Main.componentManager;
    let component = componentManager._allComponents['polkitAgent'];
    if (!component)
        return;

    if (component instanceof TosAuthenticationAgent)
        return;

    component.disable();
    delete componentManager._allComponents['polkitAgent'];

    // Create new AuthenticationAgent and replace with it
    PolkitAgent.Component = TosAuthenticationAgent;
    componentManager._allComponents['polkitAgent'] = new TosAuthenticationAgent();
    componentManager._allComponents['polkitAgent'].enable();
}

function enable() { // eslint-disable-line no-unused-vars
    if (!LoginManager.canLock())
        return;

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

    if (Main.sessionMode.isGreeter) {
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
        // Add networkAgent to show AP password popup on the lock screen
        if (!params.components)
            params.components = [];
        params.components.push('networkAgent');

        Main.sessionMode.unlockDialog = Me.imports.unlockDialog.UnlockDialog;

        if (Main.sessionMode.currentMode === 'tos')
            _connectSessionUpdatedSignal();

        if (Main.sessionMode.currentMode === 'unlock-dialog')
            _connectLockedChangedSignal();

        // To display authentication dialog when changing network settings on the lock screen.
        _replaceWithTosAuthenticationAgent();
    }
}
function disable() { // eslint-disable-line no-unused-vars
}
