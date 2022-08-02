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
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GObject } = imports.gi;
const GnomeAuthPrompt = imports.gdm.authPrompt;

const UserWidget = Me.imports.userWidget;
const UserVerifier = Me.imports.userVerifier;

var AuthPrompt = GObject.registerClass(class AuthPrompt extends GnomeAuthPrompt.AuthPrompt { // eslint-disable-line no-unused-vars
    _init(gdmClient, mode) {
        super._init(gdmClient, mode);

        this._userWidget = new UserWidget.UserWidget(null);
        this._userWell.set_child(this._userWidget);

        let reauthenticationOnly;
        if (this._mode === GnomeAuthPrompt.AuthPromptMode.UNLOCK_ONLY)
            reauthenticationOnly = true;
        else if (this._mode === GnomeAuthPrompt.AuthPromptMode.UNLOCK_OR_LOG_IN)
            reauthenticationOnly = false;

        this._userVerifier = null;
        this._userVerifier = new UserVerifier.ShellUserVerifier(this._gdmClient, { reauthenticationOnly });
        this._userVerifier.connect('ask-question', this._onAskQuestion.bind(this));
        this._userVerifier.connect('show-message', this._onShowMessage.bind(this));
        this._userVerifier.connect('verification-failed', this._onVerificationFailed.bind(this));
        this._userVerifier.connect('verification-complete', this._onVerificationComplete.bind(this));
        this._userVerifier.connect('reset', this._onReset.bind(this));
        this._userVerifier.connect('smartcard-status-changed', this._onSmartcardStatusChanged.bind(this));
        this._userVerifier.connect('credential-manager-authenticated', this._onCredentialManagerAuthenticated.bind(this));
        this.smartcardDetected = this._userVerifier.smartcardDetected;
    }

    setUser(user) {
        this._userWidget.changeUser(user);
    }

    setUserList(userList) {
        this._userWidget.setUserList(userList);
    }

    hideUserListMenu() {
        if (this._userWidget._userListMenu.isOpen)
            this._userWidget._userListMenu.toggle();
    }
});
