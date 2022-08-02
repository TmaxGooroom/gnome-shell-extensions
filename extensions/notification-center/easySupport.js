/* exported EasySupport */

const { Clutter, Gio, GLib, GnomeBluetooth, GObject, St } = imports.gi;
const _ = imports.gettext.domain('notification-center').gettext;

const SystemActions = imports.misc.systemActions.getDefault();
const Util = imports.misc.util;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { loadInterfaceXML } = imports.misc.fileUtils;
const RfkillManagerInterface = loadInterfaceXML('org.gnome.SettingsDaemon.Rfkill');
const RfkillManagerProxy = Gio.DBusProxy.makeProxyWrapper(RfkillManagerInterface);

var EasySupport = GObject.registerClass(
class EasySupport extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'notification-center-easy-support',
            vertical: true,
            y_align: Clutter.ActorAlign.END,
            y_expand: true,
        });

        this._syncId = 0;
        this._adapter = null;

        this._bluetoothHadSetupDevices  = global.settings.get_boolean('had-bluetooth-devices-setup');
        this._proxy = new RfkillManagerProxy(Gio.DBus.session, 'org.gnome.SettingsDaemon.Rfkill', '/org/gnome/SettingsDaemon/Rfkill',
            (proxy, error) => {
                if (error) {
                    log(error.message);
                    return;
                }
                this._sync();
            });
        this._client = new GnomeBluetooth.Client();
        this._model = this._client.get_model();

        /* easySupport section is consist of supportControl (Row)  & supportIconRow (Row) ,
           supportControl is used to control easySupport's mode
           For example, simple mode, detail mode, edit mode can be used.
        */
        this.supportIconSimpleMode = true;

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
    }

    makeSection() {
        this.add_child(this.supportControl);

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
        this.add_child(this.supportIconRow);

        this.supportIconRow.add_child(this.alarmIcon);
        this.supportIconRow.add_child(this.bluetoothIcon);

        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_wifi.svg', _('Network'), false));
        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_setting.svg', _('Setting'), false));
        this.supportIconRow.add_child(new SupportIcon('tos_desktop_ic_alarm_lock.svg', _('Lock Screen'), false));

        // Because button is designed private property, we need to connectButton method in SupportIcon class.
        this.bluetoothIcon._button.connect('clicked', () =>  {
            this._proxy.BluetoothAirplaneMode =  !this._proxy.BluetoothAirplaneMode;
        });

        this.supportIconRow.get_child_at_index(2)._button.connect('clicked', () =>  Util.spawnCommandLine('gnome-control-center network'));
        this.supportIconRow.get_child_at_index(3)._button.connect('clicked', () =>  Util.spawnCommandLine('gnome-control-center info-overview'));
        this.supportIconRow.get_child_at_index(4)._button.connect('clicked', () =>  SystemActions.activateLockScreen());

        // this._model.connect('row-deleted', this._queueSync.bind(this));
        // this._model.connect('row-changed', this._queueSync.bind(this));
        // this._model.connect('row-inserted', this._sync.bind(this));
        this.propertyChangeId = this._proxy.connect('g-properties-changed', this._queueSync.bind(this));

        this._sync();
    }

    destroySection() {
        this.disconnectSignals();
        this.destroy();
    }

    disconnectSignals() {

        this._proxy.disconnect(this.propertyChangeId);
        this._proxy.run_dispose();
        this._proxy = null;
        this._client.run_dispose();
        this._client = null;
    }

    /* In EasySupport Box, we can enable & disable icon's view mode */
    changeEasySupportViewMode() {
        let supportIcons = this.supportIconRow.get_children();
        this.supportIconSimpleMode = !this.supportIconSimpleMode;
        if (this.supportIconSimpleMode) {
            this.supportControlArrowButton.set_child(this.supportControlUpArrow);
            this.remove_style_pseudo_class('detail');
        } else {
            this.supportControlArrowButton.set_child(this.supportControlDownArrow);
            this.set_style_pseudo_class('detail');
        }
        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].setSimpleView(this.supportIconSimpleMode);
    }

    /* when EasySupport enter edit mode, we have to show all the information,
    and also, we need to disable ArrowButton reactive logic.
    Because, It fixed detail mode
    */
    enterEasySupportEditMode() {
        let supportIcons = this.supportIconRow.get_children();

        if (this.supportIconSimpleMode) {
            this.supportControlArrowButton.set_child(this.supportControlDownArrow);
            this.set_style_pseudo_class('detail');
        }

        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].enterEditView();

        this.supportControlArrowButton.set_reactive(false);

        this.supportControlEditButton.hide();
        this.supportControlRefreshButton.show();
        this.supportControlDoneButton.show();
    }

    /* when EasySupport leave edit mode, we need to restore EasySupport setting */
    leaveEasySupportEditMode() {
        let supportIcons = this.supportIconRow.get_children();

        if (this.supportIconSimpleMode) {
            this.supportControlArrowButton.set_child(this.supportControlUpArrow);
            this.remove_style_pseudo_class('detail');
        }

        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].leaveEditView(this.supportIconSimpleMode);

        this.supportControlArrowButton.set_reactive(true);

        this.supportControlEditButton.show();
        this.supportControlRefreshButton.hide();
        this.supportControlDoneButton.hide();
    }

    refreshEasySupportLayout() {
        let supportIcons = this.supportIconRow.get_children();

        for (let i = 0; i < supportIcons.length; i++)
            supportIcons[i].show();
    }

    _setBluetoothHadSetupDevices(value) {
        if (this._bluetoothHadSetupDevices === value)
            return;

        this._bluetoothHadSetupDevices = value;
        global.settings.set_boolean(
            'had-bluetooth-devices-setup', this._bluetoothHadSetupDevices);
    }

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
    }

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
    }

    _queueSync() {
        if (this._syncId)
            return;
        this._syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._syncId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

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
    }
});

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
