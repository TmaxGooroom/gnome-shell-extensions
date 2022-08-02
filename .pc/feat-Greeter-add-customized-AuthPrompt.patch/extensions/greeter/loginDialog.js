// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported LoginDialog */
/*
 * Copyright 2011 Red Hat, Inc
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <http://www.gnu.org/licenses/>.
 */

const { GObject, Clutter } = imports.gi;
const Main = imports.ui.main;
const GnomeLoginDialog = imports.gdm.loginDialog;
const CtrlAltTab = imports.ui.ctrlAltTab;

const Gettext = imports.gettext;
const _ = Gettext.gettext;

var LoginDialog = GObject.registerClass(class LoginDialog extends GnomeLoginDialog.LoginDialog {
    open() {
        Main.ctrlAltTabManager.addGroup(this,
            _('Login Window'),
            'dialog-password-symbolic',
            { sortGroup: CtrlAltTab.SortGroup.MIDDLE });
        this.activate();

        this.opacity = 0;

        // NOTE(210803, sohee): Remove the modal push code in this position
        // to float network setup window.

        this.ease({
            opacity: 255,
            duration: 1000,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });

        return true;
    }

    close() {
        // NOTE(210803, sohee): Since the modal push code has been deleted,
        // delete modal pop code as well.

        Main.ctrlAltTabManager.removeGroup(this);
    }
});
