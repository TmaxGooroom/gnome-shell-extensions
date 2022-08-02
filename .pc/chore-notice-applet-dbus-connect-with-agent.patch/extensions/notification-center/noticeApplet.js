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

const { Gtk, Gdk, Gio, GLib, Soup, Notify, WebKit2 } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var PANEL_TRAY_ICON_SIZE = 22;
var NOTIFICATION_LIMIT = 5;
var NOTIFICATION_TEXT_LIMIT = 17;
var NOTIFICATION_TIMEOUT = 5000;
var NOTIFICATION_MSG_ICON = 'notice-applet-msg';
var NOTIFICATION_MSG_URGENCY_ICON = 'notice-applet-msg-urgency';
var DEFAULT_TRAY_ICON = 'notice-applet-panel';
var DEFAULT_NOTICE_TRAY_ICON = 'notice-applet-event-panel';

var noticeApplet = class applet {
    init(notificationCenter) {
        this.notificationCenter = notificationCenter;
        log('notice applet started');
    }

    enable() {
        this.window = null;

        this.total      = 0;
        this.queue      = {};
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
        this.imgStatus = false;
        this.agentProxy = null;

        this.button = this.notificationCenter.noticeButton;
        this.button.connect('clicked', () => this.onButtonToggled());

        // this.tray = new Gtk.image_from_icon_name (DEFAULT_TRAY_ICON, Gtk.Iconsize.BUTTON);
        // this.tray.set_pixel_size(PANEL_TRAY_ICON_SIZE);
        // this.button.add(this.tray);

        let monitor = Gio.NetworkMonitor.get_default();
        this.networkSig = monitor.connect('network-changed', available => this.onNetworkChanged(available));
        this.isConnected = monitor.get_network_available();

        /* if (this.isConnected && this.isAgent)
        this.button.show_all();*/

        if (this.isConnected)
            GLib.timeout_add(0, 500, this.noticeUpdateDelay);

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

    onButtonToggled() {
        if (!this.button.get_checked())
            return;

        this.button.set_checked(false);

        if (this.window) {
            this.window.destroy();
            this.window = null;
            return;
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
                GLib.timeout_add(0, 500, this.noticeUpdateDelay);
        }

    }

    noticeUpdateDelay() {
        this.bindAgentSignal();
        this.noticeUpdate();
    }

    bindAgentSignal() {
        if (this.agentProxy && this.agentId === 0)
            this.agentId = this.agentProxy.connect('g-signal', (sender, signal, parameters) => this.agentSignalCallback(signal, parameters));
    }

    noticeUpdate() {
        if (!this.agentProxy)
            return;

        let json = `{"module":{"module_name":"noti","task":{"task_name":"get_noti","in":{"login_id":"${GLib.get_user_name()}"}}}}`;
        this.agentProxy.call('do_task', GLib.Variant.new_string(json), Gio.DBusCallFlags.NONE, -1, null, this.noticeDoneCallback);
    }

    agentProxyGet() {
        if (this.agentProxy)
            return;

        this.agentProxy = new Gio.DBusProxy({ g_bus_type: Gio.BusType.SYSTEM,
            g_flags: Gio.DBusProxyFlags.NONE,
            g_interface_info: null,
            g_name: 'kr.gooroom.agent',
            g_object_path: '/kr/gooroom/agent',
            g_interface_name: 'kr.gooroom.agent' });
    }

    agentSignalCallback(signal, parameters) {
        if (signal !== 'set_noti')
            return;

        this.getNoticeFromJson(parameters.get_string()[0], true);
        let total = this.queue.length();

        if (total <= 0 && this.disabledCnt <= 0)
            return;

        this.imgStatus = true;
        // this.trayIconChange();

        if (this.isJob)
            return;

        if (total > 0)
            GLib.timeout_add(0, 500, this.noticeImmediatelyJob());
        if (this.disabledCnt > 0)
            GLib.timeout_add(0, 500, this.noticeClickToJob());
    }

    noticeDoneCallback(sourceObject, res) {
        let data = sourceObject.call_finish(res);

        if (data) {
            this.getNoticeFromJson(data.get_string()[0], false);
            let total = this.queue.length();

            if (total > 0 || this.disabledCnt > 0) {
                this.imgStatus = true;

                if (this.isJob)
                    return;

                if (total > 0)
                    GLib.timeout_add(0, 500, this.noticeImmediatelyJob());
                if (this.disabledCnt > 0)
                    GLib.timeout_add(500, this.noticeClickToJob());
            }
            this.isAgent = true;
        }
    // this.trayIconChange ();
    }

    getNoticeFromJson(data, urgency) {
        let json = JSON.parse(data);
        let notiObj = json;

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

        if (notiObj['signing'])
            this.signing = notiObj['signing'];
        if (notiObj['client_id'])
            this.clientId = notiObj['client_id'];
        if (notiObj['session_id'])
            this.sessionId = notiObj['session_id'];
        if (notiObj['disabled_title_view_cnt'])
            this.disabledCnt = notiObj['disabled_title_view_cnt'];
        if (notiObj['default_noti_domain'])
            this.defaultDomain = notiObj['default_noti_domain'];

        if (notiObj['enabled_title_view_notis']) {
            for (let i = 0; i < notiObj['enabled_title_view_notis'].length(); i++) {
                if (!notiObj['enabled_title_view_notis'][i])
                    continue;

                let n = new Notify.Notification();
                n.title = notiObj['enabled_title_view_notis'][i]['title'];
                n.url = notiObj['enabled_title_view_notis'][i]['url'];
                n.icon = urgency ? NOTIFICATION_MSG_URGENCY_ICON : NOTIFICATION_MSG_ICON;
                this.queue.push(n);
            }
        }
    }

    noticeImmediatelyJob() {
        this.isJob = true;
        let n;

        while (this.queue.length()) {
            n = this.queue.shift();

            if (NOTIFICATION_LIMIT <= this.total) {
                this.queue.push(n);
                return this.isJob;
            }

            this.total++;
            let title = this.noticeLimitText(n.title, NOTIFICATION_TEXT_LIMIT);
            let notification = this.notificationOpened(title, n.icon);
            // GLib.HashTable.insert(this.dataList, notification, n);
            notification.connect('closed', () => this.onNotificationClosed);
            return this.isJob;
        }

        this.isJob = false;
        return this.isJob;
    }

    noticeClickToJob() {
        this.isJob = true;

        let n;
        n.title = this.noticeOtherText(_('Notice'), this.disabledCnt);
        n.url = this.defaultDomain;
        n.icon = NOTIFICATION_MSG_ICON;

        if (NOTIFICATION_LIMIT <= this.total) {
            this.queue.push(n);
            GLib.timeout_add(0, 500, this.noticeImmediatelyJob());

            this.isJob = false;
            return this.isJob;
        }

        this.total++;
        let notification = this.notificationOpened(n.title, n.icon);
        // GLib.HashTable.insert(this.dataList, notification, n);
        notification.connect('closed', () => this.onNotificationClosed());
        this.isJob = false;
        return this.isJob;
    }

    noticeLimitText(text, limit) {
        let title = text.strip();
        if (limit < title.length())
            title = `${title.substring(0, limit)}...`;
        return title;
    }

    noticeOtherText(text, otherCnt) {
        let title = text.strip();
        if (otherCnt > 1)
            title = `${title}other ${otherCnt} cases`;
        return title;
    }

    notificationOpened(title, icon) {
        let notification = new Notify.notification(title, '', icon);
        notification.add_action('default', _('detail view'), data => this.onNotificationPopupOpened(data), null);
        notification.set_urgency(Notify.Urgency.NORMAL);
        notification.set_timeout(NOTIFICATION_TIMEOUT);
        notification.show(null);

        return notification;
    }

    onNotificationClosed() {
        this.total--;

        // if (this.window)
        // return;

    // GLib.HashTable.remove(this.dataList, notification);
    }

    onNotificationPopupOpened(data) {
        // let res;
        // let key;

        // if (!GLib.HashTable.lookup_extended(this.dataList, data, key, res))
        // return;

        this.noticePopup(data.url);
    }

    noticePopup(url) {
        if (this.window) {
            this.window.destroy();
            this.window = null;
        }

        if (!url && this.defaultDomain)
            url = this.defaultDomain;

        if (!url)
            return;

        this.imgStatus = false;
        // this.trayIconChange();

        let window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL });
        window.set_border_width(5);
        window.set_type_hint(Gdk.WindowTypeHint.DIALOG);
        window.set_skip_taskbar_hint(true);
        window.set_title(_('Notice'));
        window.set_default_size(600, 550);

        let mainVbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 5 });
        window.add(mainVbox);
        mainVbox.show();

        let scrollWindow = new Gtk.ScrolledWindow();
        scrollWindow.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);
        mainVbox.pack_start(scrollWindow, true, true, 0);
        scrollWindow.show();

        let view = new WebKit2.WebView();
        scrollWindow.add(view);

        window.connect('delete-event', () => this.onNotificationWindowClosed());
        view.connect('close', () => this.onNotificationPopupWebviewClosed());

        view.load_uri(url);

        let context = view.get_context();
        let manager = context.get_cookie_manager();

        let lang = this.getLanguage();
        let domain = this.getDomain(url);

        this.addCookie(manager, 'SIGNING', this.signing, domain);
        this.addCookie(manager, 'SESSION_ID', this.sessionId, domain);
        this.addCookie(manager, 'CLIENT_ID', this.clientId, domain);
        this.addCookie(manager, 'LANG_CODE', lang, domain);

        view.grab_focus();
        view.show();

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0 });
        mainVbox.pack_end(hbox, false, true, 0);
        hbox.show();

        let button = new Gtk.Button({ label: _('Close') });
        button.set_can_focus(true);
        hbox.pack_end(button, false, false, 0);
        button.connect('clicked', () => this.onNotificationPopupClosed());
        button.show();
        window.show_all();

        if (this.offsetX !== 0 && this.offsetY !== 0)
            window.move(this.offsetX, this.offsetY);
        else
            window.set_position(Gtk.WIN_POS_CENTER);


        this.window = window;

        this.queue = {};
    // GLib.HashTable.remove_all(this.dataList);
    }

    onNotificationWindowClosed() {
        if (!this.window)
            return;

        [this.offsetX, this.offsetY] = this.window.get_position();
        this.window.destroy();
        this.window = null;
    }

    onNotificationPopupWebviewClosed() {
        if (!this.window())
            return;

        [this.offsetX, this.offsetY] = this.window.get_position();
        this.window.destroy();
    }

    getLanguage() {
        let language = Gtk.get_default_language();
        if (!language)
            return;

        if (language.to_string() === 'ko-kr')
            return 'ko';
        else
            return 'en';
    }

    getDomain(url) {
        let urlToken = url.split('/');
        if (urlToken)
            return urlToken[2];
    }

    addCookie(manager, key, value, domain) {
        let cookie = new Soup.Cookie(key, value, domain, '/', -1);
        manager.add_cookie(cookie, null, this.onNotificationPopupCookieCallback());
    }

    onNotificationPopupCookieCallback() {}

    onNotificationPopupClosed() {
        if (!this.window)
            return;

        [this.offsetX, this.offsetY] = this.window.get_position();
        this.window.destroy();
        this.window = null;
    }

    onDestroy() {
        if (this.agentId)
            this.agentProxy.disconnect(this.agentId);
    /* if (this.window)
        this.window.destroy();
    if (this.data_list)
        this.dataList.destroy();
    G_OBJECT_CLASS (gooroom_notice_applet_parent_class)->finalize (object);*/
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

gooroom_notice_applet_size_allocate (widget, allocation) {
    let size;
    GtkOrientation orientation;
    GooroomNoticeApplet *applet;

    GTK_WIDGET_CLASS (gooroom_notice_applet_parent_class)->size_allocate(widget, allocation);

    orientation = gp_applet_get_orientation(GP_APPLET (applet));
    let alloc = widget.get_allocation(widget);

    if (orientation == Gtk.Orientation.HORIZONTAL)
        size = alloc.height;
    else
        size = alloc.width;

    if (this.panel_size == size)
        return;

    this.panel_size = size;

    let ctx = this.buttonget_style_context(this.button);
    let padding = ctx.get_padding(this.button.get_state_flags());
    let border = ctx.get_border(this.button.get_state_flags());

    let minus = padding.top+padding.bottom+border.top+border.bottom;
    this.minus_size = minus;
}

gooroom_notice_applet_constructed() {
    applet.show_all();
    if (!(this.isConnected && this.isAgent))
        this.button.hide();
}

gooroom_notice_applet_class_init() {
    this.size_allocate = gooroom_notice_applet_size_allocate;
    this.constructed = gooroom_notice_applet_constructed;
    this.finalize = gooroom_notice_applet_finalize;
}*/
