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

const Constants = Me.imports.constants;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const MenuButton = Me.imports.menuButton;
const _ = Gettext.gettext;

var MenuSettingsController = class {
    constructor(settings, settingsControllers, panel, panelIndex) {
        this._settings = settings;
        this.panel = panel;

        Main.loadTheme();

        this.currentMonitorIndex = 0;
        this._activitiesButton = Main.panel.statusArea.activities;

        this._menuButton = new MenuButton.MenuButton(settings, panel);

        this._settingsControllers = settingsControllers;
    }

    _reload() {
        this._menuButton.reload();
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
                    let actor = this._settingsControllers[i]._menuButton.actor;
                    let monitorForActor = Main.layoutManager.findMonitorForActor(actor);
                    if (this.currentMonitor == monitorForActor)
                        this.currentMonitorIndex = i;

                    else if (this._settingsControllers[i]._menuButton.searchMenu.isOpen)
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

    // Get the current position of the menu button and its associated position order
    _getMenuPositionTuple() {
        return ['left', 1];
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
        if (this.panel == Main.panel && !this._isActivitiesButtonPresent()) {
            // Retsore the activities button at the default position
            let parent = this._activitiesButton.container.get_parent();
            if (!parent)
                this.panel._leftBox.insert_child_at_index(this._activitiesButton.container, 0);
        }
    }

    // Add the menu button to the main panel
    _addMenuButtonToMainPanel() {
        let [menuPosition, order] = this._getMenuPositionTuple();
        this.panel.addToStatusArea('Search', this._menuButton, order, menuPosition);
    }

    // Remove the menu button from the main panel
    _removeMenuButtonFromMainPanel() {
        this.panel.menuManager.removeMenu(this._menuButton.searchMenu);
        this.panel.statusArea['Search'] = null;
    }

    // Enable the menu button
    enableButton(index) {
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
        return this.panel.statusArea['Search'] !== null;
    }

    // Destroy this object
    destroy() {
        if (this.panel == undefined)
            this._menuButton.destroy();
        else if (this._isButtonEnabled())
            this._disableButton();


        this._settings = null;
        this._activitiesButton = null;
        this._menuButton = null;
    }
};
