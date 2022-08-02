
/*
Version 22.03
=============

*/

const { Clutter, Gio, GLib, GnomeBluetooth, GObject, Gtk, Meta, Shell, St } = imports.gi;

const SystemActions       = imports.misc.systemActions.getDefault();
const Util                = imports.misc.util;
const { loadInterfaceXML } = imports.misc.fileUtils;
const Config              = imports.misc.config;
const ExtensionUtils      = imports.misc.extensionUtils;
const Me                  = imports.misc.extensionUtils.getCurrentExtension();

const Gettext             = imports.gettext;
const LangClass           = imports.lang.Class;

const MetaKeyBindingFlags = Meta.KeyBindingFlags;

const Main                = imports.ui.main;
const PanelMenuButton     = imports.ui.panelMenu.Button;
const ShellActionMode     = Shell.ActionMode;

const _                   = imports.gettext.domain('notification-center').gettext;

const RfkillManagerInterface = loadInterfaceXML('org.gnome.SettingsDaemon.Rfkill');
const RfkillManagerProxy = Gio.DBusProxy.makeProxyWrapper(RfkillManagerInterface);

let notificationCenter = null;

function enable() {

    notificationCenter = new NotificationCenter();
    notificationCenter.startNotificationCenter();
    reloadExtensionOnPrefsChange();
    reloadApplicationProfilesOnPrefsChange();

}

function disable() {
    log('disable notificationcenter');
    notificationCenter.undoChanges();
    notificationCenter.destroy();

}

function reloadApplicationProfilesOnPrefsChange() {

    // Reloads Application Profiles when preferences are changed.
    notificationCenter.reloadProfilesSignal = notificationCenter.prefs.connect('changed::reload-profiles-signal', () => notificationCenter.loadPreferences());

}

function reloadExtensionOnPrefsChange() {

    // Reloads the Extension when preferences are changed.
    notificationCenter.reloadSignal = notificationCenter.prefs.connect('changed::reload-signal', () => {
        disable();
        enable();
    });

}

/*
  SupportIcon is used to implment Easy support section
  SupportIcon consists of its icon images, its title label, its status label.
*/

var SupportIcon = GObject.registerClass(
class SupportIcon extends St.BoxLayout {
    _init(iconName, name, isToggle) {
        super._init({
            style_class: 'notification-center-support-icon',
            vertical: true,
        });

        // initialize inner component
        // Buttons, Label, widget

        this._canvas = new St.Widget({
            reactive: true,
            layout_manager: new Clutter.BinLayout(),
        });

        this._button = new St.Button({
            reactive: true,
        });
        this._closeButton = new St.Button({
            reactive: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            style_class: 'notification-center-support-icon-close-button',
        });

        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${`${Me.path}/img/${iconName}`}`),
            icon_size: 20,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._closeIconBlack = Gio.icon_new_for_string(`${`${Me.path}/img/tos_desktop_ic_alarm_cancel_b.svg`}`);
        this._closeIconWhite = Gio.icon_new_for_string(`${`${Me.path}/img/tos_desktop_ic_alarm_cancel_w.svg`}`);
        this._closeIcon = new St.Icon({
            reactive: true,
            gicon: this._closeIconBlack,
            icon_size: 18,
        });

        this._title = new St.Label({
            style_class: 'notification-center-support-icon-label',
            text: name,
        });
        this._status = new St.Label({
            style_class: 'notification-center-support-icon-label',
        });

        if (isToggle)
            this._button.set_style_class_name('notification-center-support-icon-toggle-button-on');
        else
            this._button.set_style_class_name('notification-center-support-icon-button');
        this._isToggle = isToggle;
        this._button.set_size(48, 48);


        // allocate it's view tree.

        this.add_child(this._canvas);

        this._canvas.add_actor(this._button);
        this._canvas.add_actor(this._closeButton);

        this._button.set_child(this._icon);
        this._closeButton.set_child(this._closeIcon);

        this.add_child(this._title);
        this.add_child(this._status);

        if (isToggle) {
            this._button.set_style_class_name('notification-center-support-icon-toggle-button-on');
            this._status.set_text('On');
        } else {
            this._button.set_style_class_name('notification-center-support-icon-button');
        }

        this._title.hide();
        this._status.hide();
        this._closeButton.hide();

        this._closeButton.connect('clicked', () => this.hide());
        this._closeButton.connect('motion-event', () => this._closeIcon.set_gicon(this._closeIconWhite));
        this._closeButton.connect('leave-event', () => this._closeIcon.set_gicon(this._closeIconBlack));
    }

    /* In case of toggle buttons, for example alarm & bluetooth, we have to apply different style depend on status */
    setStatus(_status) {
        if (this._isToggle) {
            if (_status) {
                this._button.set_style_class_name('notification-center-support-icon-toggle-button-on');
                this._status.set_text('On');
            } else {
                this._button.set_style_class_name('notification-center-support-icon-toggle-button-off');
                this._status.set_text('Off');
            }
        }
    }

    /* If SimpleView is enabled, Icon's labels are hidden */
    setSimpleView(_isSimple) {
        if (_isSimple) {
            this._title.hide();
            this._status.hide();
        } else {
            this._title.show();
            this._status.show();
        }
    }

    /* If Editode is enabled, we need to show all component */
    enterEditView() {
        this._title.show();
        this._status.show();
        this._closeButton.show();
    }

    /* If Editmode is disabled, we need to restore previous view */
    leaveEditView(_isSimple) {
        this.setSimpleView(_isSimple);
        this._closeButton.hide();
    }
});

const NotificationCenter = new LangClass({

    Name: 'NotificationCenter',
    Extends: PanelMenuButton,

    _init() {

        Gettext.bindtextdomain('notification-center', Config.LOCALEDIR);
        this.prefs = ExtensionUtils.getSettings('org.gnome.shell.extensions.notification-center');
        this.parent(1 - 0.5 * this.prefs.get_enum('indicator-pos'), 'NotificationCenter');

        this._systemActions         = SystemActions;
        this._messageList           = Main.panel.statusArea.dateMenu._messageList;
        this.mediaSection           = this._messageList._mediaSection;
        this.notificationSection    = this._messageList._notificationSection;
        this.eventsSection          = Main.panel.statusArea.dateMenu._eventsItem;
        this._messageListParent     = this._messageList.get_parent();
        this.newEventsSectionParent = this.eventsSection.get_parent();

        this.loadPreferences();
        this.connectedSignals     = [];
        this.dmsig                = null;
        this.cmsig                = null;
        this.dndSig               = null;
        this.reloadSignal         = null;
        this.reloadProfilesSignal = null;

        this._syncId = 0;
        this._adapter = null;

        this._bluetoothHadSetupDevices  = global.settings.get_boolean('had-bluetooth-devices-setup');
        this._proxy = new RfkillManagerProxy(Gio.DBus.session, 'org.gnome.SettingsDaemon.Rfkill', '/org/gnome/SettingsDaemon/Rfkill',
            (proxy, error) => {
                if (error) {
                    log(error.message);
                    return;
                }
                this.sync();
            });
        this._client = new GnomeBluetooth.Client();
        this._model = this._client.get_model();

        this.textureCache         = St.TextureCache.get_default();
        this.iconThemeChangeSig   = null;
        this.notificationIconName = null;

        this.notificationCount  = 0;
        this.eventsCount        = 0;
        this.mediaCount         = 0;
        this.seenEvents         = false;
        this.messageListRemoved = false;
        this.isDndOff           = true;
        this.dndpref = Main.panel.statusArea.dateMenu._indicator._settings;

        this.eventsIcon        = new St.Icon({ style_class: 'system-status-icon', visible: false, icon_name: 'x-office-calendar-symbolic' });
        this.mediaIcon         = new St.Icon({ style_class: 'system-status-icon', visible: false, icon_name: 'audio-x-generic-symbolic'  });
        this.notificationIcon  = new St.Icon({ style_class: 'system-status-icon', visible: false });
        this.emptyIcon         = new St.Icon({ style_class: 'notification-center-empty-icon',
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_img_alarm_none.png`),
            icon_size: 142,
            x_align: Clutter.ActorAlign.CENTER,
            visible: false });

        this.emptyLabel        = new St.Label({ style_class: 'notification-center-empty-label', text: _('No New Notifications'), x_align: Clutter.ActorAlign.CENTER, visible: false });
        this.titleLabel        = new St.Label({ style_class: 'notification-center-title-label', text: _('Notification Center') });
        this.eventsLabel       = new St.Label({ text: '• ', visible: false });
        this.notificationLabel = new St.Label({ text: '• ', visible: false });

        this._indicator        = new St.BoxLayout({ style_class: 'panel-status-menu-box', style: 'spacing:0.0em' });
        this.box               = new St.BoxLayout({ style_class: 'notification-center-message-list', vertical: true });
        this.titleBox          = new St.BoxLayout({ style_class: 'notification-center-title-box', vertical: false, y_align: Clutter.ActorAlign.START, x_expand: true });

        this.clearButton       = new St.Button({ style_class: 'notification-center-clear-button button', label: _('Clear'), can_focus: true, visible: false, x_expand: true });


        /* easySupport section is consist of supportControl (Row)  & supportIconRow (Row) ,
           supportControl is used to control easySupport's mode
           For example, simple mode, detail mode, edit mode can be used.
        */
        this.supportIconSimpleMode = true;

        this.easySupport       = new St.BoxLayout({ style_class: 'notification-center-easy-support', vertical: true, y_align: Clutter.ActorAlign.END, y_expand: true });
        this.supportControl    = new St.BoxLayout({ style_class: 'notification-center-support-control-row' });

        this.supportControlArrowButton = new St.Button({
            reactive: true,
            style_class: 'notification-center-support-control-button-arrow',
        });
        this.supportControlUpArrow  = new St.Icon({
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_arrow_up.svg`),
            icon_size: 24,
        });
        this.supportControlDownArrow  = new St.Icon({
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_arrow_down.svg`),
            icon_size: 24,
        });

        this.supportControlEditButton = new St.Button({ reactive: true,
            style_class: 'notification-center-support-control-button-edit',
            x_align: Clutter.ActorAlign.END,
            x_expand: true });
        this.supportControlEditButton.set_size(24, 24);

        this.supportControlEdit = new St.Icon({
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_edit.svg`),
            icon_size: 18,
        });

        this.supportControlRefreshButton = new St.Button({
            reactive: true,
            style_class: 'notification-center-support-control-refresh',
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this.supportControlRefresh = new St.Icon({
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_refresh.svg`),
            icon_size: 24,
        });

        this.supportControlDoneButton = new St.Button({
            reactive: true,
            style_class: 'notification-center-support-control-done',
        });
        this.supportControlDone = new St.Label({
            text: _('Done'),
            x_align: Clutter.ActorAlign.END,
        });

        this.supportIconRow = new St.BoxLayout({ style_class: 'notification-center-support-icon-row' });

        this.alarmIcon      = new SupportIcon('tos_desktop_ic_alarm_alarm.svg', _('Alarm'), true);
        this.bluetoothIcon  = new SupportIcon('tos_ic_alram_blutooth.svg', _('Bluetooth'), true);

        let scaleFactor     = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.scrollView     = new St.ScrollView({
            hscrollbar_policy: 2,
            style: `min-width:${this._messageList.width / scaleFactor}px;max-height: ${0.01 * this.prefs.get_int('max-height') * Main.layoutManager.monitors[0].height}px; max-width: ${this._messageList.width / scaleFactor}px; padding: 0px;`,
        });

        this.add_style_class_name('notification-center-panel-button');
        this.notificationIcon.set_pivot_point(0.5, 0);

        this.menu.actor.style_class = 'notification-center-actor';

    },

    animateOnNewNotification(times, op = 254, angle = 3) {

        if (times === 0 || !this.animateIcon) {
            this.notificationIcon.ease({
                duration: 150,
                scale_x: 1.0,
                scale_y: 1.0,
                translation_y: 0,
                opacity: 255,
                rotation_angle_z: 0,
                onComplete: () =>  this.blinkIcon(!this.menu.isOpen * this.blinkCount, this.blinkTime, 100),
            });
            return;
        }

        [this.visible, this.notificationIcon.visible] = [true, true];

        this.notificationIcon.ease({
            duration: 150,
            scale_x: 1.2,
            scale_y: 1.2,
            translation_y: -4,
            opacity: op,
            rotation_angle_z: angle,
            onComplete: () =>  this.animateOnNewNotification(--times, op - 1, -angle),
        });

    },

    blinkIcon(blinkTimes, interval, opacity) {

        if (blinkTimes > 0) {
            this.notificationIcon.ease({
                duration: interval,
                opacity,
                onComplete: () => this.blinkIcon(--blinkTimes, interval, opacity === 255 ? 100 : 255),
            });
        }

    },

    blinkIconStopIfBlinking() {

        this.notificationIcon.remove_all_transitions();
        this.notificationIcon.set_opacity(255);

    },

    dndToggle() {

        this.dndpref.set_boolean('show-banners', !this.dndpref.get_boolean('show-banners'));

    },

    /*
  loadDndStatus is legacy code, but we need to use this function, then renaming later.
  it means that rename from loadDndStatus to loadAlarmStatus.

  If show-banner is true, then Do not disturb function is disabled
  So, If show banners is true, than 'Do not disturb' is off
  Above reason, isDndoff = get_value(show-banners)
*/
    loadDndStatus() {

        this.isDndOff = this.dndpref.get_boolean('show-banners');

        this.blinkIconStopIfBlinking();
        this.manageAutohide();

        this.notificationIcon.icon_name = this.notificationIconName;

        if (this.isDndOff) {
            this.alarmIcon.setStatus(true);
            this.notificationIcon.set_opacity(255);
            this.manageLabel();
            return false;
        }

        if (Gtk.IconTheme.get_default()) {
            if (Gtk.IconTheme.get_default().has_icon('notifications-disabled-symbolic'))
                this.notificationIcon.icon_name = 'notifications-disabled-symbolic';

        } else {
            this.notificationIcon.set_opacity(150);
        }
        this.alarmIcon.setStatus(false);
        Main.messageTray._bannerBin.hide();
        this.notificationLabel.hide();
        this.eventsLabel.hide();
        return true;

    },

    loadPreferences() {

        this.autohide                     = this.prefs.get_int('autohide');
        this.mediaSectionToBeShown        = this.prefs.get_int('show-media') > 0;
        this.notificationSectionToBeShown = this.prefs.get_int('show-notification') > 0;
        this.eventsSectionToBeShown       = this.prefs.get_int('show-events') > 0;
        this.hideEmptySpace               = this.prefs.get_enum('beside-calendar');
        this.showEventsInCalendarAlso     = this.eventsSectionToBeShown ? this.hideEmptySpace === 0 : false;
        this.hideEventsSectionIfEmpty     = !this.prefs.get_boolean('hide-events-section-if-empty');
        this.showThreeIcons               = this.prefs.get_boolean('individual-icons');
        this.includeEventsCount           = this.prefs.get_boolean('include-events-count');
        this.newNotificationAction        = this.prefs.get_enum('new-notification');
        this.menuAutoclose                = this.prefs.get_boolean('autoclose-menu');
        this.eventsSectionhere            = this.showEventsInCalendarAlso;
        this.showingSections              = this.prefs.get_strv('sections-order');
        this.messageListPos               = this.prefs.get_boolean('calendar-on-left') ? 1 : 0;
        this.appBlackList                 = this.prefs.get_strv('name-list');
        this.blackListAction              = this.prefs.get_enum('for-list');
        this.animateIcon                  = this.prefs.get_boolean('animate-icon');
        this.blinkTime                    = this.prefs.get_int('blink-time');
        this.blinkCount                   = this.prefs.get_int('blink-icon') * 2;
        this.showLabel                    = this.prefs.get_boolean('show-label');
        this.changeIcons                  = this.prefs.get_boolean('change-icons');

    },

    manageAutohide() {

        if (!this.menu.isOpen) {
            this.mediaIcon.visible        = this.mediaSection._shouldShow() && this.showThreeIcons && this.mediaSectionToBeShown;
            this.eventsIcon.visible       = this.shouldShowEventsSection() && this.showThreeIcons && this.eventsSectionToBeShown;
            this.notificationIcon.visible = this.notificationSection._list.get_children().length && this.notificationSectionToBeShown ||
                                      this.mediaSection._shouldShow() && this.mediaSectionToBeShown && !this.showThreeIcons ||
                                      this.shouldShowEventsSection() && this.eventsSectionToBeShown && !this.showThreeIcons ||
                                      !this.isDndOff * this.autohide > 1;
            if (this.mediaIcon.visible || this.eventsIcon.visible || this.notificationIcon.visible || !this.autohide) {
                this.visible = true;
                this.notificationIcon.visible = this.mediaIcon.visible || this.eventsIcon.visible ? this.notificationIcon.visible : true;
                return;
            }
            this.visible = false;
        }

    },

    manageEvents(action) {

        this.eventsSection.visible = this.shouldShowEventsSection() || this.hideEventsSectionIfEmpty;

        if (this.showEventsInCalendarAlso === true) {
            switch (action) {
            case 0:
                if (this.eventsSectionhere === true)
                    return;

                this._removeSection(this.eventsSection);
                this.box.insert_child_at_index(this.eventsSection, this.showingSections.indexOf('events'));
                this.eventsSectionhere = true;
                return;
            case 1:
                if (this.eventsSectionhere === false)
                    return;

                this.box.remove_child(this.box.get_children()[this.showingSections.indexOf('events')]);
                this.newEventsSectionParent.insert_child_at_index(this.eventsSection, 0);
                this.eventsSectionhere = false;

            }
        }
    },

    manageLabel(nCount, eCount) {

        this.notificationLabel.visible = nCount * this.newNotificationAction;
        this.eventsLabel.visible = eCount * this.newNotificationAction && this.shouldShowEventsSection() > 0;

        if (this.changeIcons)
            this.manageIconChange(nCount > 0 || eCount > 0);


        if (this.newNotificationAction === 2) {

            if (nCount > 0)
                this.notificationLabel.text = `${nCount.toString()} `;

            if (eCount > 0)
                this.eventsLabel.text = `${eCount.toString()} `;


        }

    },

    manageIconChange(statusIcon) {

        let iconName = statusIcon ? 'notification-center-full' : 'notification-center-empty';

        this.notificationIcon.icon_name = iconName;

    },

    middleClickDndToggle(actor, event) {

        switch (event.get_button()) {

        case 2: // if middle click

            // close the menu, since it gets open on any click
            if (this.menu.isOpen)
                this.menu.actor.hide();

            // toggle DND state
            this.dndToggle();
            // reload dnd status
            this.loadDndStatus();

        }

    },

    newNotif(messageType) {

        Main.messageTray._bannerBin.visible = true;
        switch (messageType) {
        case 'media':
            this.mediaCount++;
            break;
        case 'notification':
            this.notificationCount = this.notificationCount + !this.menu.isOpen;
            // this.filterNotifications();
            if (this.isDndOff) {
                let source = Main.messageTray.getSources();
                if (this.appBlackList.indexOf(source[source.length - 1].title) >= 0) {
                    switch (this.blackListAction) {
                    case 0:
                        break;
                    case 1:
                        Main.messageTray._bannerBin.visible = false;
                        return;
                    case 3:
                        Main.messageTray._bannerBin.visible = false;
                        break;
                    case 2:
                        this.notificationCount--;
                        return;
                    }
                }
                this.animateOnNewNotification(5);
            }
            break;
        case 'events':
            [this.seenEvents, this.eventsCount] = [Main.panel.statusArea.dateMenu.menu.isOpen ? this.seenEvents : false, this.eventsCount + !this.menu.isOpen];
            break;
        }
        this.resetIndicator();
        this.notificationSection._messages.forEach(message => this._setMessageLayout(message));
    },

    remNotif(messageType) {

        switch (messageType) {
        case 'media':
            this.mediaCount--;
            break;
        case 'notification':
            if (this.notificationCount > 0)
                this.notificationCount--;

            break;
        case 'events':
            if (this.eventsCount > 0)
                this.eventCount--;

            break;
        }
        this.resetIndicator();

    },

    _removeSection(section) {

        if (section === this.eventsSection) {
            this.newEventsSectionParent.remove_actor(this.eventsSection);
            return;
        }

        this._messageList._sectionList.remove_actor(section);
        this._messageList._sync();

    },

    resetIndicator() {

        this.manageAutohide();
        this.clearButton.visible = this.notificationSection._canClear && this.notificationSectionToBeShown;
        this.emptyIcon.visible = !this.clearButton.visible;
        this.emptyLabel.visible = !this.clearButton.visible;
        this.eventsCount = this.eventsCount * this.includeEventsCount;

        if (this.isDndOff)
            this.manageLabel(this.notificationCount + !this.showThreeIcons * this.eventsCount, this.showThreeIcons * this.eventsCount);


    },

    _onOpenStateChanged(menu, open) {

        if (!open) {
            this.resetIndicator();
            this.remove_style_pseudo_class('active');
            return;
        }

        this.add_style_pseudo_class('active');
        this.manageEvents(0);
        [this.mediaSection.visible, this.notificationSection.visible] = [true, true];
        this.blinkIconStopIfBlinking();

        if (!this.showLabel) {
            this.notificationCount = 0;
            this.eventsCount = 0;
        }
        this.seenEvents = true;
        this.resetIndicator();

        this.menu.actor.height = 0.9 * Main.layoutManager.monitors[0].height;

    },

    setNotificationIconName() {

        if (Gtk.IconTheme.get_default())
            this.notificationIconName = Gtk.IconTheme.get_default().has_icon('notification-symbolic') ? 'notification-symbolic' : 'preferences-system-notifications-symbolic';

        else
            this.notificationIconName = 'preferences-system-notifications-symbolic';


    },

    iconThemeChanged() {

        this.setNotificationIconName();
        this.loadDndStatus();

    },

    /* In EasySupport Box, we can enable & disable icon's view mode */
    changeEasySupportViewMode() {
        let supportIcons = this.supportIconRow.get_children();
        this.supportIconSimpleMode = !this.supportIconSimpleMode;
        if (this.supportIconSimpleMode) {
            this.supportControlArrowButton.set_child(this.supportControlUpArrow);
            this.easySupport.remove_style_pseudo_class('detail');
        } else {
            this.supportControlArrowButton.set_child(this.supportControlDownArrow);
            this.easySupport.set_style_pseudo_class('detail');
        }
        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].setSimpleView(this.supportIconSimpleMode);
    },

    /* when EasySupport enter edit mode, we have to show all the information,
    and also, we need to disable ArrowButton reactive logic.
    Because, It fixed detail mode
    */
    enterEasySupportEditMode() {
        let supportIcons = this.supportIconRow.get_children();

        if (this.supportIconSimpleMode) {
            this.supportControlArrowButton.set_child(this.supportControlDownArrow);
            this.easySupport.set_style_pseudo_class('detail');
        }

        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].enterEditView();

        this.supportControlArrowButton.set_reactive(false);

        this.supportControlEditButton.hide();
        this.supportControlRefreshButton.show();
        this.supportControlDoneButton.show();
    },

    /* when EasySupport leave edit mode, we need to restore EasySupport setting */
    leaveEasySupportEditMode() {
        let supportIcons = this.supportIconRow.get_children();

        if (this.supportIconSimpleMode) {
            this.supportControlArrowButton.set_child(this.supportControlUpArrow);
            this.easySupport.remove_style_pseudo_class('detail');
        }

        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].leaveEditView(this.supportIconSimpleMode);

        this.supportControlArrowButton.set_reactive(true);

        this.supportControlEditButton.show();
        this.supportControlRefreshButton.hide();
        this.supportControlDoneButton.hide();
    },

    refreshEasySupportLayout() {
        let supportIcons = this.supportIconRow.get_children();

        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].show();
    },

    shouldShowEventsSection() {

        switch (this.eventsSection._eventsList.get_children().length) {
        case 0:
            return 0;
        default:
            return this.eventsSection._eventsList.get_children()[0].text === _('No Events') ? 0 : this.eventsSection._eventsList.get_children().length;
        }

    },

    startNotificationCenter() {

        this.add_child(this._indicator);

        this._indicator.add_child(this.eventsIcon);
        this._indicator.add_child(this.eventsLabel);
        this._indicator.add_child(this.mediaIcon);
        this._indicator.add_child(this.notificationIcon);
        this._indicator.add_child(this.notificationLabel);

        this.menu.box.add_actor(this.titleBox);

        this.setNotificationIconName();
        this.iconThemeChangeSig = this.textureCache.connect('icon-theme-changed', this.iconThemeChanged.bind(this));

        Main.panel.addToStatusArea('NotificationCenter', this, this.prefs.get_int('indicator-index'), this.prefs.get_string('indicator-pos'));
        // this.rebuildMessageList();
        this._messageListParent.remove_actor(this._messageList);
        this._messageListParent.insert_child_at_index(this._messageList, this.messageListPos);

        for (let i = 0; i < this.showingSections.length; i++) {
            if (this.showingSections[i] === 'events') {
                this.newEventsSectionParent.remove_actor(this.eventsSection);
                this.box.add(this.eventsSection);
                this.connectedSignals.push(this.eventsSection._eventsList.connect('actor-added', () => this.newNotif(this.showingSections[i])));
                this.connectedSignals.push(this.eventsSection._eventsList.connect('actor-removed', () => this.remNotif(this.showingSections[i])));
                this.eventsSection.setDate(new Date());
            } else {
                this._removeSection(this[`${this.showingSections[i]}Section`]);
                this.box.add(this[`${this.showingSections[i]}Section`]);
                this.connectedSignals.push(this[`${this.showingSections[i]}Section`]._list.connect('actor-added', () => this.newNotif(this.showingSections[i])));
                this.connectedSignals.push(this[`${this.showingSections[i]}Section`]._list.connect('actor-removed', () => this.remNotif(this.showingSections[i])));

            }
            this[`${this.showingSections[i]}Section`].add_style_class_name('notification-center-message-list-section');
        }
        // this.arrangeItems();
        this.scrollView._delegate = this;
        this.scrollView.add_actor(this.box);
        this.menu.box.add_child(this.scrollView);
        // this.addClearButton()
        if (this.prefs.get_enum('clear-button-alignment') === 3)
            return;

        this.clearButton.connect('clicked', () => {
            this.notificationSection.clear();
        });
        //        this.clearButton.set_x_align(1 + this.prefs.get_enum('clear-button-alignment'));
        this.menu.box.add_child(this.emptyIcon);
        this.menu.box.add_child(this.emptyLabel);
        this.titleBox.add_actor(this.titleLabel);
        this.titleBox.add_actor(this.clearButton);

        this.menu.box.add_actor(this.easySupport);
        this.menu.box.style = 'padding-bottom:0px;';

        this.easySupport.add_child(this.supportControl);

        this.supportControlArrowButton.set_child(this.supportControlUpArrow);
        this.supportControl.add_child(this.supportControlArrowButton);
        this.supportControlEditButton.set_child(this.supportControlEdit);
        this.supportControlDoneButton.set_child(this.supportControlDone);
        this.supportControlRefreshButton.set_child(this.supportControlRefresh);
        this.supportControl.add_child(this.supportControlEditButton);
        this.supportControl.add_actor(this.supportControlRefreshButton);
        this.supportControl.add_actor(this.supportControlDoneButton);

        this.supportControlRefreshButton.hide();
        this.supportControlDoneButton.hide();

        this.supportControlArrowButton.connect('clicked', () => this.changeEasySupportViewMode());
        this.supportControlEditButton.connect('clicked', () => this.enterEasySupportEditMode());
        this.supportControlRefreshButton.connect('clicked', () => this.refreshEasySupportLayout());
        this.supportControlDoneButton.connect('clicked', () => this.leaveEasySupportEditMode());
        this.easySupport.add_child(this.supportIconRow);

        this.supportIconRow.add_child(this.alarmIcon);
        this.supportIconRow.add_child(this.bluetoothIcon);

        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_wifi.svg', _('Network'), false));
        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_setting.svg', _('Setting'), false));
        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_lock.svg', _('Lock Screen'), false));

        // Because button is designed private property, we need to connectButton method in SupportIcon class.
        this.alarmIcon._button.connect('clicked', () => this.dndToggle());
        this.bluetoothIcon._button.connect('clicked', () =>  {
            this._proxy.BluetoothAirplaneMode =  !this._proxy.BluetoothAirplaneMode;
        });

        this.supportIconRow.get_child_at_index(2)._button.connect('clicked', () =>  Util.spawnCommandLine('gnome-control-center network'));
        this.supportIconRow.get_child_at_index(3)._button.connect('clicked', () =>  Util.spawnCommandLine('gnome-control-center info-overview'));
        this.supportIconRow.get_child_at_index(4)._button.connect('clicked', () =>  this._systemActions.activateLockScreen());

        this._model.connect('row-deleted', this._queueSync.bind(this));
        this._model.connect('row-changed', this._queueSync.bind(this));
        this._model.connect('row-inserted', this._sync.bind(this));
        Main.sessionMode.connect('updated', this._sync.bind(this));
        this._proxy.connect('g-properties-changed', this._queueSync.bind(this));


        this.loadDndStatus();
        this._sync();

        this.resetIndicator();

        Main.messageTray.bannerAlignment = this.prefs.get_enum('banner-pos');
        Main.messageTray.set_y_align(Clutter.ActorAlign.END);
        // this.removeDotAndBorderFromDateMenu();
        Main.panel.statusArea.dateMenu.get_children()[0].remove_actor(Main.panel.statusArea.dateMenu._indicator);
        this.dtActors = Main.panel.statusArea.dateMenu.get_children()[0].get_children();
        Main.panel.statusArea.dateMenu.get_children()[0].remove_actor(this.dtActors[0]);

        if (this.showingSections.length === 3 && !this.showEventsInCalendarAlso)
            this._messageListParent.get_children()[1].style = 'border-width: 0px';

        // this.indicatorViewShortcut();
        Main.wm.addKeybinding(
            'indicator-shortcut',
            this.prefs,
            MetaKeyBindingFlags.NONE,
            ShellActionMode.NORMAL | ShellActionMode.OVERVIEW | ShellActionMode.POPUP,
            () => {
                this.notificationIcon.visible = !(this.mediaIcon.visible || this.eventsIcon.visible);
                this.visible = true;
                this.menu.toggle();
            }
        );

        this.dndSig = this.dndpref.connect('changed::show-banners', () => {
            this.loadDndStatus();
        });

        if (this.prefs.get_boolean('middle-click-dnd'))
            this.connect('button-press-event', (actor, event) => this.middleClickDndToggle(actor, event));


        this.dmSig = Main.panel.statusArea.dateMenu.menu.connect('open-state-changed', () => {
            if (Main.panel.statusArea.dateMenu.menu.isOpen) {
                switch (this.hideEmptySpace) {
                case 0:
                    this.manageEvents(1);
                    if (this.showLabel === false)
                        this.eventsCount = 0;

                    this.resetIndicator();
                    break;

                case 2:
                    if (!this.mediaSectionToBeShown && this.mediaSection._shouldShow() || !this.notificationSectionToBeShown && this.notificationSection._list.get_children().length || !this.eventsSectionToBeShown &&  this.shouldShowEventsSection()) {
                        if (this.messageListRemoved) {
                            this._messageListParent.insert_child_at_index(this._messageList, this.messageListPos);
                            this.messageListRemoved = false;
                        }
                    } else if (!this.messageListRemoved) {
                        this._messageListParent.remove_actor(this._messageList);
                        this.messageListRemoved = true;
                    }
                    break;
                }
            } else {
                Main.panel.statusArea.dateMenu._calendar.setDate(new Date());
                this.eventsCount = this.seenEvents ? 0 : this.eventsCount;
                this.resetIndicator();
            }

        });

        if (this.menuAutoclose) {
            this.cmsig = global.display.connect('notify::focus-window', () => {
                if (global.display.focus_window !== null && this.menu.isOpen)
                    this.menu.close(1);

            });
        }

        this.defaultWeatherItemVisibility = Main.panel.statusArea.dateMenu._weatherItem.visible;
        Main.panel.statusArea.dateMenu._weatherItem.visible = !this.prefs.get_boolean('hide-weather-section') && this.defaultWeatherItemVisibility;

        this.defaultClocksItemVisibility = Main.panel.statusArea.dateMenu._clocksItem.visible;
        Main.panel.statusArea.dateMenu._clocksItem.visible =  !this.prefs.get_boolean('hide-clock-section') && this.defaultClocksItemVisibility;

        this.defaultDateVisibility = Main.panel.statusArea.dateMenu._date.visible;
        Main.panel.statusArea.dateMenu._date.visible =  !this.prefs.get_boolean('hide-date-section') && this.defaultDateVisibility;

        this.notificationSection._messages.forEach(message => this._setMessageLayout(message));

        // apply UI changes also to sub panels
        if (global.dashToPanel.panels) {
            if (global.dashToPanel.panels.length < 2)
                return;
            this.subDtActors = [];
            this.subMessageLists = [];
            this.subMessageListParents = [];
            global.dashToPanel.panels.forEach(panel => {
                if (panel !== Main.panel.get_parent())
                    this.changeSubPanelUI(panel);
            });
        } else {
            // when dashtopanel loaded lately
        }
    },

    changeSubPanelUI(panel) {
        log('several panels');
        log(global.dashToPanel.panels.length);
        // remove dots and borders from sub panel datemenu
        const dtActor = panel.statusArea.dateMenu.get_children()[0].get_children()[0];
        this.subDtActors.push(dtActor);
        panel.statusArea.dateMenu.get_children()[0].remove_actor(dtActor);
        panel.statusArea.dateMenu.get_children()[0].remove_actor(panel.statusArea.dateMenu._indicator);

        // remove messagelist from datemenu in sub panel
        const messageList = panel.statusArea.dateMenu._messageList;
        this.subMessageLists.push(messageList);
        this.subMessageListParents.push(messageList.get_parent());
        messageList.get_parent().remove_actor(messageList);

        // use same default visitility value of main panel
        panel.statusArea.dateMenu._weatherItem.visible = !this.prefs.get_boolean('hide-weather-section') && this.defaultWeatherItemVisibility;
        panel.statusArea.dateMenu._clocksItem.visible =  !this.prefs.get_boolean('hide-clock-section') && this.defaultClocksItemVisibility;
        panel.statusArea.dateMenu._date.visible =  !this.prefs.get_boolean('hide-date-section') && this.defaultDateVisibility;
    },

    revertSubPanelUI(panel) {
    // revert dots and borders from sub panel datemenu
        panel.statusArea.dateMenu.get_children()[0].insert_child_at_index(this.subDtActors.shift(), 0);
        panel.statusArea.dateMenu.get_children()[0].add_actor(panel.statusArea.dateMenu._indicator);

        // revert messagelist of datemenu in sub panel
        this.subMessageListParents.shift().insert_child_at_index(this.subMessageLists.shift(), 0);

        // revert visibility of items
        panel.statusArea.dateMenu._weatherItem.visible = this.defaultWeatherItemVisibility;
        panel.statusArea.dateMenu._clocksItem.visible = this.defaultClocksItemVisibility;
        panel.statusArea.dateMenu._date.visible = this.defaultDateVisibility;
    },

    undoChanges() {

        // revert UI changes in sub panel
        if (global.dashToPanel.panels) {
            if (global.dashToPanel.panels.length < 2)
                return;
            global.dashToPanel.panels.forEach(panel => {
                if (panel !== Main.panel.get_parent())
                    this.revertSubPanelUI(panel);
            });
        }

        this.blinkIconStopIfBlinking();

        if (this.messageListRemoved) {
            this._messageListParent.insert_child_at_index(this._messageList, 0);
            this.messageListRemoved = false;
        } else {
            this._messageListParent.remove_actor(this._messageList);
            this._messageListParent.insert_child_at_index(this._messageList, 0);
        }

        this._messageListParent.get_children()[1].style = '';

        this._messageList._dndSwitch.show();
        this._messageList._dndButton.label_actor.show();

        this.manageEvents(0);
        // this.removeAndDisconnectSections();
        let len = this.showingSections.length;
        while (len !== 0) {

            if (this.showingSections[len - 1] === 'events') {

                this[`${this.showingSections[len - 1]}Section`]._eventsList.disconnect(this.connectedSignals[2 * len - 1]);
                this[`${this.showingSections[len - 1]}Section`]._eventsList.disconnect(this.connectedSignals[2 * len - 2]);

                this.box.remove_child(this.box.get_children()[len - 1]);
                this.newEventsSectionParent.add_actor(this.eventsSection);
            } else {
                this[`${this.showingSections[len - 1]}Section`]._list.disconnect(this.connectedSignals[2 * len - 1]);
                this[`${this.showingSections[len - 1]}Section`]._list.disconnect(this.connectedSignals[2 * len - 2]);

                this.box.remove_child(this.box.get_children()[len - 1]);
                this._messageList._addSection(this[`${this.showingSections[len - 1]}Section`]);
            }
            this[`${this.showingSections[len - 1]}Section`].remove_style_class_name('notification-center-message-list-section');
            this.connectedSignals.pop();
            this.connectedSignals.pop();

            len--;
        }

        this._removeSection(this.mediaSection);
        this._removeSection(this.notificationSection);
        this._removeSection(this.eventsSection);

        this._messageList._addSection(this.mediaSection);
        this._messageList._addSection(this.notificationSection);
        this.newEventsSectionParent.insert_child_at_index(this.eventsSection, 0);

        Main.messageTray._bannerBin.show();
        Main.messageTray.bannerAlignment = 2;

        Main.panel.statusArea.dateMenu.menu.disconnect(this.dmSig);

        if (this.menuAutoclose)
            global.display.disconnect(this.cmsig);


        if (this.dndSig !== null)
            this.dndpref.disconnect(this.dndSig);


        if (this.iconThemeChangeSig !== null)
            this.textureCache.disconnect(this.iconThemeChangeSig);


        Main.panel.statusArea.dateMenu.get_children()[0].insert_child_at_index(this.dtActors[0], 0);
        Main.panel.statusArea.dateMenu.get_children()[0].add_actor(Main.panel.statusArea.dateMenu._indicator);

        Main.panel.statusArea.dateMenu._weatherItem.visible = this.defaultWeatherItemVisibility;
        Main.panel.statusArea.dateMenu._clocksItem.visible  = this.defaultClocksItemVisibility;
        Main.panel.statusArea.dateMenu._date.visible        = this.defaultDateVisibility;

        Main.wm.removeKeybinding('indicator-shortcut');

        this.eventsIcon.destroy();
        this.eventsLabel.destroy();
        this.mediaIcon.destroy();
        this.notificationIcon.destroy();
        this.notificationLabel.destroy();
        this._indicator.destroy();

        this.clearButton.destroy();
        this.box.destroy();
        this.scrollView.destroy();
        this.emptyIcon.destroy();
        this.emptyLabel.destroy();
        this.titleLabel.destroy();
        this.easySupport.destroy();
        this.titleBox.destroy();

        this.prefs.disconnect(this.reloadSignal);
        this.prefs.disconnect(this.reloadProfilesSignal);

    },

    _setBluetoothHadSetupDevices(value) {
        if (this._bluetoothHadSetupDevices === value)
            return;

        this._bluetoothHadSetupDevices = value;
        global.settings.set_boolean(
            'had-bluetooth-devices-setup', this._bluetoothHadSetupDevices);
    },

    _getDefaultBluetoothAdapter() {
        let [ret, iter] = this._model.get_iter_first();
        while (ret) {
            let isDefault = this._model.get_value(iter,
                GnomeBluetooth.Column.DEFAULT);
            let isPowered = this._model.get_value(iter,
                GnomeBluetooth.Column.POWERED);
            if (isDefault && isPowered)
                return iter;
            ret = this._model.iter_next(iter);
        }
        return null;
    },

    _getBluetoothDeviceInfos(adapter) {
        if (!adapter)
            return [];

        let deviceInfos = [];
        let [ret, iter] = this._model.iter_children(adapter);
        while (ret) {
            const isPaired = this._model.get_value(iter,
                GnomeBluetooth.Column.PAIRED);
            const isTrusted = this._model.get_value(iter,
                GnomeBluetooth.Column.TRUSTED);

            if (isPaired || isTrusted) {
                deviceInfos.push({
                    connected: this._model.get_value(iter,
                        GnomeBluetooth.Column.CONNECTED),
                    name: this._model.get_value(iter,
                        GnomeBluetooth.Column.ALIAS),
                });
            }

            ret = this._model.iter_next(iter);
        }

        return deviceInfos;
    },


    _queueSync() {
        if (this._syncId)
            return;
        this._syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._syncId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    },

    _sync() {
        let adapter = this._getDefaultBluetoothAdapter();
        let devices = this._getBluetoothDeviceInfos(adapter);

        if (adapter && this._adapter)
            this._setBluetoothHadSetupDevices(devices.length > 0);
        this._adapter = adapter;

        // Remember if there were setup devices and show the menu
        // if we've seen setup devices and we're not hard blocked
        if (this._bluetoothHadSetupDevices)
            this.bluetoothIcon.setStatus(!this._proxy.BluetoothHardwareAirplaneMode);
        else
            this.bluetoothIcon.setStatus(this._proxy.BluetoothHasAirplaneMode && !this._proxy.BluetoothAirplaneMode);
    },

    _setMessageLayout(message)  {
        // check whether message's timelabel moved or not
        // timelabel move should be done only once
        if (!message._secondaryBin.child)
            return;
        message.add_style_class_name('notification-center-message');
        message._bodyStack.style_class = 'notification-center-bodystack';
        // move timelabel from side of title to down of body
        let contentBox = message.child.get_child_at_index(0).get_child_at_index(1);
        let timelabel = message._secondaryBin.child;
        message._secondaryBin.child = null;
        contentBox.add_child(timelabel);
        message.setExpandedLines(3);
        message.expand();
    },
});
