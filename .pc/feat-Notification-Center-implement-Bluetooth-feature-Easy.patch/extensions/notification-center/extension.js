
/*
Version 22.03
=============

*/

const { Clutter, Gio, GObject, Gtk, Meta, Shell, St } = imports.gi;
const SystemActions       = imports.misc.systemActions.getDefault();
const Util                = imports.misc.util;
const Config              = imports.misc.config;
const ExtensionUtils      = imports.misc.extensionUtils;
const Gettext             = imports.gettext;
const LangClass           = imports.lang.Class;
const Main                = imports.ui.main;
const Me                  = imports.misc.extensionUtils.getCurrentExtension();
const MetaKeyBindingFlags = Meta.KeyBindingFlags;
const PanelMenuButton     = imports.ui.panelMenu.Button;
const PopupMenu           = imports.ui.popupMenu;
const ShellActionMode     = Shell.ActionMode;
const _                   = imports.gettext.domain('notification-center').gettext;

let notificationCenter = null;

function enable() {

    notificationCenter = new NotificationCenter();
    notificationCenter.startNotificationCenter();
    reloadExtensionOnPrefsChange();
    reloadApplicationProfilesOnPrefsChange();

}

function disable() {

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
  SupportIcon consists of its image, its title label, its status label.
*/

var SupportIcon = GObject.registerClass(
class SupportIcon extends St.BoxLayout {
    _init(iconName, name, isToggle) {
        super._init({
            style_class: 'notification-center-support-icon',
            vertical: true,
        });

        this._button = new St.Button({
            reactive: true,
        });

        if (isToggle)
            this._button.set_style_class_name('notification-center-support-icon-toggle-button-on');
        else
            this._button.set_style_class_name('notification-center-support-icon-button');
        this._isToggle = isToggle;
        this._button.set_size(48, 48);

        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${`${Me.path}/img/${iconName}`}`),
            icon_size: 16,
        });
        this._button.set_child(this._icon);
        this.add_child(this._button);

        this._title = new St.Label({
            style_class: 'notification-center-support-icon-label',
            text: name,
        });

        this._status = new St.Label({
            style_class: 'notification-center-support-icon-label',
        });

        if (isToggle)
            this._status.set_text('On');
        this.add_child(this._title);
        this.add_child(this._status);
    }

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
        let gicon              = Gio.icon_new_for_string(`${Me.path}/img/tos_img_alarm_none.png`);
        this.emptyIcon         = new St.Icon({ gicon, style_class: 'notification-center-empty-icon', icon_size: 142, x_align: Clutter.ActorAlign.CENTER, visible: false });
        this.emptyLabel        = new St.Label({ style_class: 'notification-center-empty-label', text: _('No New Notifications'), x_align: Clutter.ActorAlign.CENTER, visible: false });
        this.titleLabel        = new St.Label({ style_class: 'notification-center-title-label', text: _('Notification Center') });
        this.eventsLabel       = new St.Label({ text: '• ', visible: false });
        this.notificationLabel = new St.Label({ text: '• ', visible: false });
        this._indicator        = new St.BoxLayout({ style_class: 'panel-status-menu-box', style: 'spacing:0.0em' });
        this.box               = new St.BoxLayout({ style_class: 'notification-center-message-list', vertical: true });
        this.titleBox          = new St.BoxLayout({ style_class: 'notification-center-title-box', vertical: false, y_align: Clutter.ActorAlign.START, x_expand: true });
        this.clearButton       = new St.Button({ style_class: 'notification-center-clear-button button', label: _('Clear'), can_focus: true, visible: false, x_expand: true });

        this.easySupport       = new St.BoxLayout({ style_class: 'notification-center-easy-support', vertical: true, y_align: Clutter.ActorAlign.END, y_expand: true });
        this.supportControl    = new St.BoxLayout({ style_class: 'notification-center-support-control-row' });

        this.supportControlUpArrow  = new St.Icon({ gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_arrow_up.svg`),
            icon_size: 24 });
        this.supportControlDownArrow  = new St.Icon({
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_arrow_down.svg`),
            icon_size: 24,
        });
        this.supportControlEdit = new St.Icon({
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_edit.svg`),
            icon_size: 16,
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this.supportControlRefresh = new St.Icon({
            gicon: Gio.icon_new_for_string(`${Me.path}/img/tos_desktop_ic_alarm_refresh.svg`),
            icon_size: 24,
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this.supportControlDone = new St.Label({
            text: _('Done'),
            style_class: 'notification-center-support-control-done',
            x_align: Clutter.ActorAlign.END,
        });

        this.supportIconRow = new St.BoxLayout({ style_class: 'notification-center-support-icon-row' });
        this.dndItem        = new PopupMenu.PopupSwitchMenuItem(this._messageList._dndButton.label_actor.text, false, {});
        this.alarmIcon      = new SupportIcon('tos_desktop_ic_alarm_alarm.svg', _('Alarm'), true);

        let scaleFactor     = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.scrollView     = new St.ScrollView({ hscrollbar_policy: 2, style: `min-width:${this._messageList.width / scaleFactor}px;max-height: ${0.01 * this.prefs.get_int('max-height') * Main.layoutManager.monitors[0].height}px; max-width: ${this._messageList.width / scaleFactor}px; padding: 0px;` });

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

        /*
        if (this.dndPos < 0)
            this.dndItem.setToggleState(!this.isDndOff);
        */

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
        // this.dndPos                       = this.prefs.get_enum('dnd-position');
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
        this.notificationSection._messages.forEach(message => {
            message.add_style_class_name('notification-center-message');
            message._bodyStack.style_class = 'notification-center-bodystack';
            let contentBox = message.child.get_child_at_index(0).get_child_at_index(1);
            let timelabel = message._secondaryBin.child;
            message._secondaryBin.child = null;
            contentBox.add_child(timelabel);
            message.setExpandedLines(3);
            message.expand();
        });

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

        /*
        if (this.dndPos < 0) {
            this.dndItem._delegate = this;
            this.dndItem.connect('toggled', () => this.dndToggle());
            this._messageList._dndSwitch.hide();
            this._messageList._dndButton.label_actor.hide();

            this.easySupport.add_actor(this.dndItem);
        }
        */

        this.easySupport.add_child(this.supportControl);

        // this.supportControl.add_actor(this.supportControlUpArrow);
        this.supportControl.add_child(this.supportControlDownArrow);
        // this.supportControl.add_actor(this.supportControlEdit);
        // this.supportControl.add_actor(this.supportControlRefresh);
        // this.supportControl.add_actor(this.supportControlDone);

        // this.supportControlUpArrow.hide();
        // this.supportControlEdit.hide();
        // this.supportControlDownArrow.hide();
        // this.supportControlRefresh.hide();
        // this.supportControlDone.hide();

        this.easySupport.add_child(this.supportIconRow);

        this.supportIconRow.add_child(this.alarmIcon);
        this.supportIconRow.add_child(new SupportIcon('tos_ic_alram_blutooth.svg', _('Bluetooth'), true));
        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_wifi.svg', _('Network'), false));
        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_setting.svg', _('Setting'), false));
        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_lock.svg', _('Lock Screen'), false));

        // Because button is designed private property, we need to connectButton method in SupportIcon class.
        this.alarmIcon._button.connect('clicked', () => this.dndToggle());
        this.supportIconRow.get_child_at_index(2)._button.connect('clicked', () =>  Util.spawnCommandLine('gnome-control-center network'));
        this.supportIconRow.get_child_at_index(3)._button.connect('clicked', () =>  Util.spawnCommandLine('gnome-control-center info-overview'));
        this.supportIconRow.get_child_at_index(4)._button.connect('clicked', () =>  this._systemActions.activateLockScreen());

        this.loadDndStatus();
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

        this.notificationSection._messages.forEach(message => {
            message.add_style_class_name('notification-center-message');
            message._bodyStack.style_class = 'notification-center-bodystack';
            let contentBox = message.child.get_child_at_index(0).get_child_at_index(1);
            let timelabel = message._secondaryBin.child;
            message._secondaryBin.child = null;
            contentBox.add_child(timelabel);
            message.setExpandedLines(3);
            message.expand();
        });

    },

    undoChanges() {

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


        if (this.dndSig !== null) {
            this.dndpref.disconnect(this.dndSig);
            this.dndItem.destroy();
        }

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

});
