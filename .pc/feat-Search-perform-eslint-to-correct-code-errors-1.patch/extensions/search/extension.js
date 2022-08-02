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

const { GLib, Gio, St } = imports.gi;
const Constants = Me.imports.constants;
const Controller = Me.imports.controller;
const Convenience = Me.imports.convenience;
const Main = imports.ui.main;
const Util = imports.misc.util;
const Utils = Me.imports.utils;


// Initialize panel button variables
let settings;
let settingsControllers;
let extensionChangedId;
let dockToggleID;
let dockExtension;

// Initialize menu language translations
function init(metadata) {
    Convenience.initTranslations(Me.metadata['gettext-domain']);
}

// Enable the extension
function enable() {
    if (imports.gi.Meta.is_wayland_compositor())
        Me.metadata.isWayland = true;
    else
        Me.metadata.isWayland = false;

    settings = Convenience.getSettings(Me.metadata['settings-schema']);
    settings.connect('changed::multi-monitor', () => _onMultiMonitorChange());
    settingsControllers = [];

    if (global.dashToPanel)
        _enableButtons();


    // dash to panel might get enabled after Search
    extensionChangedId = Main.extensionManager.connect('extension-state-changed', (data, extension) => {
        if (extension.uuid === 'dash-to-panel@tos-shell-extensions') {
            if (extension.state === 1) {
                _connectDtpSignals();
                _enableButtons();
            } else if (extension.state === 2) {
                _disconnectDtpSignals();
                for (let i = settingsControllers.length - 1; i >= 0; --i) {
                    let sc = settingsControllers[i];
                    _disableButton(sc, 1);
                }
            }
        }
        /*
        if ((extension.uuid === "dash-to-dock@micxgx.gmail.com" || extension.uuid === "ubuntu-dock@ubuntu.com")) {
            _disconnectDtdSignals();
            if(extension.state === 1){
                for (let i = settingsControllers.length - 1; i >= 0; --i) {
                    let sc = settingsControllers[i];
                    _disableButton(sc, 1);
                }
                _enableButtons();
                _connectDtdSignals();
            }
        }
        */
    });

    // listen to dash to panel if they are compatible and already enabled
    _connectDtpSignals();
}

// Disable the extension
function disable() {
    if (extensionChangedId > 0) {
        Main.extensionManager.disconnect(extensionChangedId);
        extensionChangedId = 0;
    }

    _disconnectDtpSignals();

    for (let i = settingsControllers.length - 1; i >= 0; --i) {
        let sc = settingsControllers[i];
        _disableButton(sc, 1);
    }
    settingsControllers = null;

    settings.run_dispose();
    settings = null;
}

function _connectDtpSignals() {
    if (global.dashToPanel)
        global.dashToPanel._amPanelsCreatedId = global.dashToPanel.connect('panels-created', () => _enableButtons());

}

function _disconnectDtpSignals() {
    if (global.dashToPanel && global.dashToPanel._amPanelsCreatedId) {
        global.dashToPanel.disconnect(global.dashToPanel._amPanelsCreatedId);
        delete global.dashToPanel._amPanelsCreatedId;
    }
}

function _onMultiMonitorChange() {
    for (let i = settingsControllers.length - 1; i >= 0; --i) {
        let sc = settingsControllers[i];
        _disableButton(sc, 1);
    }
    _enableButtons();
}

function _getDockExtensions() {
    let dashToDock = Main.extensionManager.lookup('dash-to-dock@micxgx.gmail.com');
    let ubuntuDash = Main.extensionManager.lookup('ubuntu-dock@ubuntu.com');
    let dock;
    if (dashToDock && dashToDock.stateObj && dashToDock.stateObj.dockManager)
        dock = dashToDock;

    if (ubuntuDash && ubuntuDash.stateObj && ubuntuDash.stateObj.dockManager)
        dock = ubuntuDash;

    return dock;
}

function _enableButtons() {
    let multiMonitor = settings.get_boolean('multi-monitor');
    dockExtension = _getDockExtensions();
    if (!dockExtension) {
        let panelArray = global.dashToPanel ? global.dashToPanel.panels.map(pw => pw) : [Main.panel];
        let iterLength = multiMonitor ? panelArray.length : 1;
        for (var index = 0; index < iterLength; index++) {
            let panel = global.dashToPanel ? panelArray[index].panel : panelArray[index];
            let panelParent = panelArray[index];

            let isPrimaryStandAlone = global.dashToPanel ? 'isPrimary' in panelParent && panelParent.isPrimary && panelParent.isStandalone : false;

            if (isPrimaryStandAlone)
                panel = Main.panel;


            if (panel.statusArea['Search'])
                continue;
            else if (settingsControllers[index])
                _disableButton(settingsControllers[index], 1);

            let settingsController = new Controller.MenuSettingsController(
                settings, settingsControllers, panel, index);

            if (global.dashToPanel)
                panel._amDestroyId = panel.connect('destroy', () => extensionChangedId ? _disableButton(settingsController, 1) : null);


            settingsController.enableButton();
            settingsControllers.push(settingsController);
        }
    }
}

function _disableButton(controller, remove) {
    if (controller.panel._amDestroyId) {
        controller.panel.disconnect(controller.panel._amDestroyId);
        delete controller.panel._amDestroyId;
    }

    controller.destroy();

    if (remove)
        settingsControllers.splice(settingsControllers.indexOf(controller), 1);

}
