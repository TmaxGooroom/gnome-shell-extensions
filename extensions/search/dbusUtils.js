/* Search: Search Bar for GNOME Shell
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Gio = imports.gi.Gio;

var FreeDesktopFileManagerProxy; // eslint-disable-line no-unused-vars
var SwitcherooControlProxyClass;
var SwitcherooControlProxy;
var discreteGpuAvailable; // eslint-disable-line no-unused-vars

const FreeDesktopFileManagerInterface = `<node>
<interface name='org.freedesktop.FileManager1'>
    <method name='ShowFolders'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='StartupId' type='s' direction='in'/>
    </method>
</interface>
</node>`;

const FreeDesktopFileManagerProxyInterface = Gio.DBusProxy.makeProxyWrapper(FreeDesktopFileManagerInterface);

const SwitcherooControlInterface = `<node>
<interface name="net.hadess.SwitcherooControl">
    <property name="HasDualGpu" type="b" access="read"/>
    <property name="NumGPUs" type="u" access="read"/>
    <property name="GPUs" type="aa{sv}" access="read"/>
</interface>
</node>`;

const SWITCHEROO_CONTROL_BUS_NAME = 'net.hadess.SwitcherooControl';
const SWITCHEROO_CONTROL_OBJECT_PATH = '/net/hadess/SwitcherooControl';

function _switcherooProxyAppeared() {
    SwitcherooControlProxyClass = Gio.DBusProxy.makeProxyWrapper(SwitcherooControlInterface);
    SwitcherooControlProxy = new SwitcherooControlProxyClass(Gio.DBus.system,
        SWITCHEROO_CONTROL_BUS_NAME, SWITCHEROO_CONTROL_OBJECT_PATH,
        (proxy, error) => {
            if (error) {
                discreteGpuAvailable = false;
                log(error.message);
                return;
            }
            discreteGpuAvailable = SwitcherooControlProxy.HasDualGpu;
        });
}

function init() { // eslint-disable-line no-unused-vars
    FreeDesktopFileManagerProxy = new FreeDesktopFileManagerProxyInterface(
        Gio.DBus.session,
        'org.freedesktop.FileManager1',
        '/org/freedesktop/FileManager1',
        (proxy, error) => {
            if (error)
                log('Error connecting to Nautilus');

        }
    );

    SwitcherooControlProxy = null;
    discreteGpuAvailable = false;
    Gio.DBus.system.watch_name(SWITCHEROO_CONTROL_BUS_NAME,
        Gio.BusNameWatcherFlags.NONE,
        _switcherooProxyAppeared,
        () => {
            SwitcherooControlProxy = null;
            discreteGpuAvailable = false;
        });
}
