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

const { Gio, Gtk } = imports.gi;
const Constants = Me.imports.constants;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Helper = Me.imports.helper;
const Main = imports.ui.main;
const MenuButton = Me.imports.menuButton;
const Utils = Me.imports.utils;
const _ = Gettext.gettext;

var MenuSettingsController = class { // eslint-disable-line no-unused-vars
    constructor(settings, settingsControllers, panel, panelIndex) {
        this._settings = settings;
        this.panel = panel;

        Main.loadTheme();

        this.currentMonitorIndex = 0;
        this._activitiesButton = Main.panel.statusArea.activities;
        this.enableHotkey = panelIndex === 0;

        this._menuButton = new MenuButton.MenuButton(settings, panel);

        this._settingsControllers = settingsControllers;
        this._hotCornerManager = new Helper.HotCornerManager(this._settings, () => this.toggleMenus());
        if (this.enableHotkey) {
            this._menuHotKeybinder = new Helper.MenuHotKeybinder(() => this._onHotkey());
            this._keybindingManager = new Helper.KeybindingManager(this._settings);
        }
        this._applySettings();
    }

    // Load and apply the settings from the arc-menu settings
    _applySettings() {
        this._updateHotCornerManager();
        if (this.enableHotkey)
            this._updateHotKeyBinder();
        this._setButtonAppearance();
        this._setButtonText();
        this._setButtonIcon();
        this._setButtonIconSize();
        this._setButtonIconPadding();
    }

    // Bind the callbacks for handling the settings changes to the event signals
    bindSettingsChanges() {
        this.settingsChangeIds = [
            this._settings.connect('changed::hot-corners', this._updateHotCornerManager.bind(this)),
            this._settings.connect('changed::recently-installed-apps', this._reload.bind(this)),
            this._settings.connect('changed::pinned-app-list', this._updateFavorites.bind(this)),
        ];
    }

    _reload() {
        this._menuButton.reload();
    }

    updateLocation() {
        this._menuButton.updateLocation();
    }

    updateIcons() {
        this._menuButton.updateIcons();
    }

    _setDefaultMenuView() {
        this._menuButton.setDefaultMenuView();
    }

    toggleMenus() {
        if (Main.overview.visible) {
            Main.overview.hide();
        } else if (global.dashToPanel) {
            this.currentMonitor = Main.layoutManager.currentMonitor;
            // close current menus that are open on monitors other than current monitor
            if (this._settingsControllers.length > 1) {
                for (let i = 0; i < this._settingsControllers.length; i++) {
                    let actor = this._settingsControllers[i]._menuButton.menuButtonWidget.actor;
                    let monitorForActor = Main.layoutManager.findMonitorForActor(actor);
                    if (this.currentMonitor === monitorForActor)
                        this.currentMonitorIndex = i;
                    else if (this._settingsControllers[i]._menuButton.arcMenu.isOpen)
                        this._settingsControllers[i]._menuButton.toggleMenu();
                }
                // open the current monitors menu
                this._settingsControllers[this.currentMonitorIndex]._menuButton.toggleMenu();
            } else {
                this._menuButton.toggleMenu();
            }
        } else {
            this._menuButton.toggleMenu();
        }
    }

    _updateStyle() {
        this._menuButton.updateStyle();
    }

    _updateMenuHeight() {
        this._menuButton.updateHeight();
    }

    _updateFavorites() {
        if (this._menuButton.getShouldLoadFavorites())
            this._menuButton._loadFavorites();

        // If the active category is Pinned Apps, redisplay the new Pinned Apps
        if (this._menuButton.MenuLayout)
            this._menuButton._displayFavorites();
    }

    _updateHotCornerManager() {
        let hotCornerAction = this._settings.get_enum('hot-corners');
        if (hotCornerAction === Constants.HOT_CORNERS_ACTION.Default)
            this._hotCornerManager.restoreDefaultHotCorners();

        else if (hotCornerAction === Constants.HOT_CORNERS_ACTION.Disabled)
            this._hotCornerManager.disableHotCorners();

        else if (hotCornerAction === Constants.HOT_CORNERS_ACTION.ToggleArcMenu)
            this._hotCornerManager.modifyHotCorners();

        else if (hotCornerAction === Constants.HOT_CORNERS_ACTION.Custom)
            this._hotCornerManager.modifyHotCorners();

    }

    _updateHotKeyBinder() {
        if (this.enableHotkey) {
            let hotkeySettingsKey = 'menu-keybinding-text';
            let menuKeyBinding = '';
            let hotKeyPos = this._settings.get_enum('menu-hotkey');

            this._keybindingManager.unbind(hotkeySettingsKey);
            this._menuHotKeybinder.disableHotKey();
            this._menuKeyBindingKey = 0;

            if (hotKeyPos === Constants.HOT_KEY.Custom) {
                this._keybindingManager.bind(hotkeySettingsKey, 'menu-keybinding', () => this._onHotkey());
                menuKeyBinding = this._settings.get_string(hotkeySettingsKey);
            } else if (hotKeyPos === Constants.HOT_KEY.Super_L || hotKeyPos === Constants.HOT_KEY.Super_R) {
                let hotKey = Constants.HOT_KEY[hotKeyPos];
                this._menuHotKeybinder.enableHotKey(hotKey);
                menuKeyBinding = hotKey;
            }
            if (menuKeyBinding)
                this._menuKeyBindingKey = Gtk.accelerator_parse(menuKeyBinding)[0];

        }
    }

    _onHotkey() {
        let hotKeyPos = this._settings.get_enum('menu-hotkey');
        if (hotKeyPos === Constants.HOT_KEY.Super_L)
            this.toggleMenus();

        else
            this._onHotkeyRelease();

    }

    _onHotkeyRelease() {
        let activeMenu = this._settingsControllers[this.currentMonitorIndex]._menuButton.getActiveMenu();
        let focusPanel = this.panel;
        let focusTarget = activeMenu
            ? activeMenu.actor || activeMenu : focusPanel;

        this.disconnectKeyRelease();

        this.keyInfo = {
            pressId: focusTarget.connect('key-press-event', () => this.disconnectKeyRelease()),
            releaseId: focusTarget.connect('key-release-event', (actor, event) => {
                this.disconnectKeyRelease();

                if (this._menuKeyBindingKey === event.get_key_symbol())
                    this.toggleMenus();

            }),
            target: focusTarget,
        };

        focusTarget.grab_key_focus();
    }

    disconnectKeyRelease() {
        if (this.keyInfo && this.keyInfo.target) {
            this.keyInfo.target.disconnect(this.keyInfo.pressId);
            this.keyInfo.target.disconnect(this.keyInfo.releaseId);
            this.keyInfo = 0;
        }
    }

    // Place the menu button to main panel as specified in the settings
    _setButtonPosition() {
        if (this._isButtonEnabled()) {
            this._removeMenuButtonFromMainPanel();
            this._addMenuButtonToMainPanel();
            this._setMenuPositionAlignment();
        }
    }

    _setMenuPositionAlignment() {
        this._menuButton._setMenuPositionAlignment();
    }

    // Change the menu button appearance as specified in the settings
    _setButtonAppearance() {
        let menuButtonWidget = this._menuButton.menuButtonWidget;
        this._removeActivitiesButtonFromMainPanel();
        this._menuButton.container.set_width(-1);
        this._menuButton.container.set_height(-1);
        menuButtonWidget.actor.show();
        menuButtonWidget.hidePanelText();
        menuButtonWidget.showPanelIcon();
        this._setMenuButtonArrow();
    }

    _setMenuButtonArrow() {
        let menuButtonWidget = this._menuButton.menuButtonWidget;
        menuButtonWidget.hideArrowIcon();
    }

    // Update the text of the menu button as specified in the settings
    _setButtonText() {
        // Update the text of the menu button
        let menuButtonWidget = this._menuButton.menuButtonWidget;
        let label = menuButtonWidget.getPanelLabel();
        label.set_text('Applications');
    }

    // Update the icon of the menu button as specified in the settings
    _setButtonIcon() {
        let menuButtonWidget = this._menuButton.menuButtonWidget;
        let stIcon = menuButtonWidget.getPanelIcon();

        let iconString = Utils.getMenuButtonIcon();
        stIcon.set_gicon(Gio.icon_new_for_string(iconString));
    }

    // Update the icon of the menu button as specified in the settings
    _setButtonIconSize() {
        let menuButtonWidget = this._menuButton.menuButtonWidget;
        let stIcon = menuButtonWidget.getPanelIcon();
        stIcon.icon_size = 25;
    }

    _setButtonIconPadding() {
        this._menuButton.style = null;
    }

    // Get the current position of the menu button and its associated position order
    _getMenuPositionTuple() {
        return ['left', 0];
    }

    // Check if the activities button is present on the main panel
    _isActivitiesButtonPresent() {
        // Thanks to lestcape @github.com for the refinement of this method.
        return this._activitiesButton &&
            this._activitiesButton.container &&
            this.panel._leftBox.contains(this._activitiesButton.container);
    }

    // Remove the activities button from the main panel
    _removeActivitiesButtonFromMainPanel() {
        if (this._isActivitiesButtonPresent())
            this.panel._leftBox.remove_child(this._activitiesButton.container);

    }

    // Add or restore the activities button on the main panel
    _addActivitiesButtonToMainPanel() {
        if (this.panel === Main.panel && !this._isActivitiesButtonPresent()) {
            // Retsore the activities button at the default position
            let parent = this._activitiesButton.container.get_parent();
            if (!parent)
                this.panel._leftBox.insert_child_at_index(this._activitiesButton.container, 0);
        }
    }

    // Add the menu button to the main panel
    _addMenuButtonToMainPanel() {
        let [menuPosition, order] = this._getMenuPositionTuple();
        this.panel.addToStatusArea('ArcMenu', this._menuButton, order, menuPosition);
    }

    // Remove the menu button from the main panel
    _removeMenuButtonFromMainPanel() {
        this.panel.menuManager.removeMenu(this._menuButton.arcMenu);
        this.panel.statusArea['ArcMenu'] = null;
    }

    // Enable the menu button
    enableButton() {
        this._removeActivitiesButtonFromMainPanel();
        this._addMenuButtonToMainPanel();
        this._menuButton.initiate();
    }

    // Disable the menu button
    _disableButton() {
        this._removeMenuButtonFromMainPanel();
        this._addActivitiesButtonToMainPanel();
        this._menuButton.destroy();
    }

    _isButtonEnabled() {
        return this.panel.statusArea['ArcMenu'] !== null;
    }

    // Destroy this object
    destroy() {
        this.settingsChangeIds.forEach(id => this._settings.disconnect(id));
        this._hotCornerManager.destroy();

        if (this.panel === undefined)
            this._menuButton.destroy();

        else if (this._isButtonEnabled())
            this._disableButton();


        if (this.enableHotkey) {
            this.disconnectKeyRelease();
            this._menuHotKeybinder.destroy();
            this._keybindingManager.destroy();
        }
        this._settings = null;
        this._activitiesButton = null;
        this._menuButton = null;
    }
};
