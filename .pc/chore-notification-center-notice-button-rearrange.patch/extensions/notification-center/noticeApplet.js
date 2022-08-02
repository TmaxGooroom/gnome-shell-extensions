/* exported noticeApplet */

/*
 * Copyright (C) 2018-2019 Gooroom <gooroom@gooroom.kr>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <http://www.gnu.org/licenses/>.
 *
 */

const { Gio, GLib } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var NOTIFICATION_LIMIT = 5;
var NOTIFICATION_TEXT_LIMIT = 17;
// var PANEL_TRAY_ICON_SIZE = 22;
// var NOTIFICATION_MSG_ICON = 'notice-applet-msg';
// var DEFAULT_TRAY_ICON = 'notice-applet-panel';
// var DEFAULT_NOTICE_TRAY_ICON = 'notice-applet-event-panel';

var noticeApplet = class applet {
    init(notificationCenter) {
        this.notificationCenter = notificationCenter;
        log('notice applet started');
    }

    enable() {

        this.window = null;

        this.total      = 0;
        this.queue      = [];
        // this.dataList = GLib.HashTable.new_full(GLib.direct_hash, GLib.direct_equal, this.onHashKeyDestroy, this.onHashValueDestroy);

        this.signing    = null;
        this.sessionId = null;
        this.clientId  = null;
        this.defaultDomain = null;
        this.disabledCnt = 0;
        this.agentId = 0;
        this.offsetX = 0;
        this.offsetY = 0;

        this.isJob = false;
        this.isAgent = false;
        this.isConnected = false;
        // this.imgStatus = false;
        this.agentProxy = null;
        this.subProc = null;

        this.button = this.notificationCenter.noticeButton;
        this.button.connect('clicked', () => this.onButtonToggled());

        let monitor = Gio.NetworkMonitor.get_default();
        this.networkSig = monitor.connect('network-changed', available => this.onNetworkChanged(available));
        this.isConnected = monitor.get_network_available();

        if (this.isConnected && this.isAgent)
            this.button.show();

        if (this.isConnected)
            GLib.timeout_add(0, 500, () => this.noticeUpdateDelay());

    }

    onHashKeyDestroy(data) {
        if (!data)
            return;
        data.close();
    }

    onHashValueDestroy(data) {
        if (!data)
            return;

        if (data.title)
            delete data.title;
        if (data.url)
            delete data.url;
        if (data.icon)
            delete data.icon;
    }

    onButtonToggled() {
        if (!this.button.get_checked())
            return;

        this.button.set_checked(false);

        if (this.window) {
            if (!this.window.get_if_exited()) {
                this.window.force_exit();
                this.window = null;
                return;
            }
        }
        this.noticePopup(null);
    }

    onNetworkChanged(available) {
        if (this.isConnected === available)
            return;

        this.isConnected = available;
        // this.trayIconChange();

        if (this.isConnected) {
            if (!this.agentProxy && !this.isAgent)
                GLib.timeout_add(0, 500, () => this.noticeUpdateDelay());
        }

    }

    noticeUpdateDelay() {
        this.bindAgentSignal();
        this.noticeUpdate();
    }

    async bindAgentSignal() {
        await this.agentProxyGet();
        if (!this.agentProxy)
            return;

        if (!this.agentId)
            this.agentId = this.agentProxy.connect('g-signal', (proxy, sender, signal, parameters) => this.agentSignalCallback(signal, parameters));
    }

    async noticeUpdate() {
        await this.agentProxyGet();
        if (!this.agentProxy)
            return;
        let json = `{"module":{"module_name":"noti","task":{"task_name":"get_noti","in":{"login_id":"${GLib.get_user_name()}"}}}}`;
        let arg = GLib.Variant.new('(s)', [json]);

        this.agentProxy.call('do_task', arg, Gio.DBusCallFlags.NONE, -1, null, (source, res) => this.noticeDoneCallback(source, res));
    }

    async agentProxyGet() {
        if (this.agentProxy)
            return;

        this.agentProxy = await Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null, 'kr.gooroom.agent', '/kr/gooroom/agent', 'kr.gooroom.agent', null);
    }

    agentSignalCallback(signal, parameters) {
        if (signal !== 'set_noti')
            return;

        let res = parameters.get_child_value(0).get_variant();
        this.getNoticeFromJson(res.get_string()[0], true);
        let total = this.queue.length;

        if (total <= 0 && this.disabledCnt <= 0)
            return;

        // this.imgStatus = true;
        // this.trayIconChange();

        if (this.isJob)
            return;

        if (total > 0)
            GLib.timeout_add(0, 500, () => this.noticeImmediatelyJob());
        if (this.disabledCnt > 0)
            GLib.timeout_add(0, 500, () => this.noticeClickToJob());
    }

    noticeDoneCallback(sourceObject, res) {
        let ret = sourceObject.call_finish(res);
        if (!ret)
            return;

        let v = ret.get_child_value(0);
        if (!v)
            return;

        let data = v.get_variant();
        if (!data)
            return;

        this.getNoticeFromJson(data.get_string()[0], false);
        let total = this.queue.length;

        if (total > 0 || this.disabledCnt > 0) {
        // this.imgStatus = true;

            if (this.isJob)
                return;

            if (total > 0)
                GLib.timeout_add(0, 500, () => this.noticeImmediatelyJob());
            if (this.disabledCnt > 0)
                GLib.timeout_add(0, 500, () => this.noticeClickToJob());
        }
        this.isAgent = true;
    // this.trayIconChange ();
    }

    getNoticeFromJson(data, urgency) {
        let json;
        try {
            json = JSON.parse(data);
        } catch (e) {
            log('failed json parsing');
            return;
        }
        let notiObj = json;
        this.temp = notiObj;

        if (!urgency) {
            let obj4 = json['module']['task']['out']['status'];

            if (!obj4)
                return;
            if (obj4 !== '200')
                return;

            notiObj = json['module']['task']['out']['noti_info'];
            if (!notiObj)
                return;
        }

        this.disabledCnt = notiObj['disabled_title_view_cnt'];
        this.signing = notiObj['signing'];
        this.clientId = notiObj['client_id'];
        this.sessionId = notiObj['session_id'];
        this.defaultDomain = notiObj['default_noti_domain'];
        if (!this.signing)
            this.signing = 'empty';
        if (!this.clientId)
            this.clientId = 'empty';
        if (!this.sessionId)
            this.sessionId = 'empty';
        if (!this.defaultDomain)
            this.defaultDomain = 'empty';

        if (notiObj['enabled_title_view_notis']) {
            for (let i = 0; i < notiObj['enabled_title_view_notis'].length; i++) {
                if (!notiObj['enabled_title_view_notis'][i])
                    continue;

                let n = [notiObj['enabled_title_view_notis'][i]['title'], notiObj['enabled_title_view_notis'][i]['url']];
                this.queue.push(n);
            }
        }
    }

    noticeImmediatelyJob() {
        this.isJob = true;
        let n;

        while (this.queue.length) {
            n = this.queue.shift();

            if (NOTIFICATION_LIMIT <= this.total) {
                this.queue.push(n);
                return this.isJob;
            }

            this.total++;
            let title = this.noticeLimitText(n[0], NOTIFICATION_TEXT_LIMIT);
            this.notificationOpened(title, n[1]);
            // GLib.HashTable.insert(this.dataList, notification, n);
            this.total--;
            return this.isJob;
        }

        this.isJob = false;
        return this.isJob;
    }

    noticeClickToJob() {
        log('noticeclicktojob');
        this.isJob = true;

        let title = this.noticeOtherText(_('Notice'), this.disabledCnt);
        let url = this.defaultDomain;
        // n.icon = NOTIFICATION_MSG_ICON;

        if (NOTIFICATION_LIMIT <= this.total) {
            this.queue.push([title, url]);
            GLib.timeout_add(0, 500, () => this.noticeImmediatelyJob());

            this.isJob = false;
            return this.isJob;
        }

        this.total++;
        this.notificationOpened(title, url);
        // GLib.HashTable.insert(this.dataList, notification, n);
        this.total--;
        this.isJob = false;
        return this.isJob;
    }

    noticeLimitText(text, limit) {
        let title = text.trim();
        if (limit < title.length)
            title = `${title.substring(0, limit)}...`;
        return title;
    }

    noticeOtherText(text, otherCnt) {
        let title = text.trim();
        if (otherCnt > 1)
            title = `${title}other ${otherCnt} cases`;
        return title;
    }

    notificationOpened(title, url) {
        let Alarm = new Gio.Subprocess({ argv: ['gjs', '/usr/share/gnome-shell/extensions/notification-center@tmax-shell-extensions/noticeAlarm.js', title, url] });
        Alarm.init(null);
    }

    onNotificationClosed() {
        this.total--;

        // if (this.window)
        // return;

    // GLib.HashTable.remove(this.dataList, notification);
    }

    onNotificationPopupOpened(data) {
        /* let res;
        let key;

        if (!GLib.HashTable.lookup_extended(this.dataList, data, key, res))
        return;*/

        this.noticePopup(data.url);
    }

    noticePopup(url) {
        if (this.window) {
            if (!this.window.get_if_exited()) {
                this.window.force_exit();
                this.window = null;
            }
        }

        if (!url && this.defaultDomain)
            url = this.defaultDomain;

        if (url === 'empty') {
            log('no url');
            return;
        }

        // this.imgStatus = false;
        // this.trayIconChange();

        this.window = new Gio.Subprocess({ argv: ['gjs', '/usr/share/gnome-shell/extensions/notification-center@tmax-shell-extensions/noticeView.js', url, this.signing, this.sessionId, this.clientId] });
        this.window.init(null);

        this.queue = [];
    // GLib.HashTable.remove_all(this.dataList);
    }

    onDestroy() {
        if (this.agentId)
            this.agentProxy.disconnect(this.agentId);
    /* if (this.data_list)
        this.dataList.destroy();*/
    }

};


/*
struct _GooroomNoticeAppletPrivate
{
    GtkWidget    *tray;
    GtkWidget    *window;
    GtkWidget    *button;
    GQueue       *queue;
    GHashTable   *data_list;

    gint         total;
    gint         panel_size;
    gint         minus_size;
    gint         disabled_cnt;
    gint         offset_x;
    gint         offset_y;
    gulong       agent_id;

    gchar        *signing;
    gchar        *session_id;
    gchar        *client_id;
    gchar        *default_domain;

    gboolean     img_status;
    gboolean     is_agent;
    gboolean     is_connected;
    gboolean     is_job;
};

typedef struct
{
    gchar    *url;
    gchar    *title;
    gchar    *icon;
}NoticeData;

    trayIconChange() {
        let icon = this.img_status ? DEFAULT_NOTICE_TRAY_ICON : DEFAULT_TRAY_ICON;

        this.tray.set_from_icon_name(icon, Gtk.Iconsize.BUTTON);
        this.tray.set_pixel_size(PANEL_TRAY_ICON_SIZE);

        if (this.is_connected && this.is_agent) {
            this.button.show_all();
            this.button.set_sensitive(true);
        } else {
            this.button.hide();
        }
    }

*/
