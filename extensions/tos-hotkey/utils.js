const { Gio, GLib } = imports.gi;

var TRANSLATION_DOMAIN = imports.misc.extensionUtils.getCurrentExtension().metadata['gettext-domain'];  // eslint-disable-line no-unused-vars

const MutterDisplayConfigIface = `
<node>
<interface name="org.gnome.Mutter.DisplayConfig">
    <method name="GetResources">
      <arg name="serial" direction="out" type="u" />
      <arg name="crtcs" direction="out" type="a(uxiiiiiuaua{sv})" />
      <arg name="outputs" direction="out" type="a(uxiausauaua{sv})" />
      <arg name="modes" direction="out" type="a(uxuudu)" />
      <arg name="max_screen_width" direction="out" type="i" />
      <arg name="max_screen_height" direction="out" type="i" />
    </method>
    <method name="GetCurrentState">
      <arg name="serial" direction="out" type="u" />
      <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />
      <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />
      <arg name="properties" direction="out" type="a{sv}" />
    </method>
    <method name="ApplyMonitorsConfig">
      <arg name="serial" direction="in" type="u" />
      <arg name="method" direction="in" type="u" />
      <arg name="logical_monitors" direction="in" type="a(iiduba(ssa{sv}))" />
      <arg name="properties" direction="in" type="a{sv}" />
    </method>
</interface>
</node>`;

Gio._promisify(Gio.DBusProxy.prototype, 'call', 'call_finish');

const MutterDisplayConfigProxyIface = Gio.DBusProxy.makeProxyWrapper(MutterDisplayConfigIface);

var MutterDisplayConfigProxy = class { // eslint-disable-line no-unused-vars
    constructor() {
        this._proxy = new MutterDisplayConfigProxyIface(
            Gio.DBus.session,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            (proxy, error) => {
                if (error)
                    log('error connecting to Mutter');

            }
        );

        this._methodsInfo = {};

        for (let info of this._proxy.g_interface_info.methods)
            this._methodsInfo[info.name] = info;

    }

    async call(methodName, params = []) {
        if (!this._methodsInfo[methodName])
            return;

        if (params.length !== this._methodsInfo[methodName].in_args.length)
            return;


        let result;
        if (this._methodsInfo[methodName].in_args.length === 0) {
            try {
                result = await this._proxy.call(methodName, null, Gio.DBusCallFlags.NONE, -1, null);
            } catch (e) {
                throw new Error(e);
            }
            return result.deepUnpack();
        }

        let inTypeString = '(';
        for (let arg of this._methodsInfo[methodName].in_args)
            inTypeString += arg.signature;

        inTypeString += ')';

        params = new GLib.Variant(inTypeString, params);
        try {
            result = await this._proxy.call(methodName, params, Gio.DBusCallFlags.NONE, -1, null);
        } catch (e) {
            throw new Error(e);
        }
        return result.deepUnpack();
    }
};
