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
const { GObject } = imports.gi;
const GnomeAuthPrompt = imports.gdm.authPrompt;

var AuthPrompt = GObject.registerClass(class AuthPrompt extends GnomeAuthPrompt.AuthPrompt { // eslint-disable-line no-unused-vars
    _init(gdmClient, mode) {
        super._init(gdmClient, mode);
        this.style = 'background-color:rgb(255, 128, 0);';
    }
});
