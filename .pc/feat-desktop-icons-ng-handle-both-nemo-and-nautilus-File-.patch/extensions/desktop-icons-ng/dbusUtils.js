/* exported NemoFileOperationsProxy FreeDesktopFileManagerProxy GnomeNautilusPreviewProxy discreteGpuAvailable GnomeArchiveManagerProxy init */
/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
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
var NemoFileOperationsProxy;
var FreeDesktopFileManagerProxy;
var GnomeNautilusPreviewProxy;
var SwitcherooControlProxyClass;
var SwitcherooControlProxy;
var discreteGpuAvailable;
var GnomeArchiveManagerProxy;

const NemoFileOperationsInterface = `<node>
<interface name='org.Nemo.FileOperations'>
    <method name='CopyURIs'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='Destination' type='s' direction='in'/>
    </method>
    <method name='MoveURIs'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='Destination' type='s' direction='in'/>
    </method>
    <method name='EmptyTrash'>
    </method>
    <method name='TrashFiles'>
        <arg name='URIs' type='as' direction='in'/>
    </method>
    <method name='CreateFolder'>
        <arg name='URI' type='s' direction='in'/>
    </method>
    <method name='RenameFile'>
        <arg name='URI' type='s' direction='in'/>
        <arg name='NewName' type='s' direction='in'/>
    </method>
    <method name='Undo'>
    </method>
    <method name='Redo'>
    </method>
    <property name='UndoStatus' type='i' access='read'/>
</interface>
</node>`;

const NemoFileOperationsProxyInterface = Gio.DBusProxy.makeProxyWrapper(NemoFileOperationsInterface);

const FreeDesktopFileManagerInterface = `<node>
<interface name='org.freedesktop.FileManager1'>
    <method name='ShowItems'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='StartupId' type='s' direction='in'/>
    </method>
    <method name='ShowItemProperties'>
        <arg name='URIs' type='as' direction='in'/>
        <arg name='StartupId' type='s' direction='in'/>
    </method>
</interface>
</node>`;

const FreeDesktopFileManagerProxyInterface = Gio.DBusProxy.makeProxyWrapper(FreeDesktopFileManagerInterface);

const GnomeNautilusPreviewInterface = `<node>
<interface name='org.gnome.NautilusPreviewer'>
    <method name='ShowFile'>
        <arg name='FileUri' type='s' direction='in'/>
        <arg name='ParentXid' type='i' direction='in'/>
        <arg name='CloseIfShown' type='b' direction='in'/>
    </method>
</interface>
</node>`;

const GnomeNautilusPreviewProxyInterface = Gio.DBusProxy.makeProxyWrapper(GnomeNautilusPreviewInterface);

const SwitcherooControlInterface = `<node>
<interface name="net.hadess.SwitcherooControl">
    <property name="HasDualGpu" type="b" access="read"/>
    <property name="NumGPUs" type="u" access="read"/>
    <property name="GPUs" type="aa{sv}" access="read"/>
</interface>
</node>`;

const SWITCHEROO_CONTROL_BUS_NAME = 'net.hadess.SwitcherooControl';

function _switcherooProxyAppeared() {
    SwitcherooControlProxyClass = Gio.DBusProxy.makeProxyWrapper(SwitcherooControlInterface);
    SwitcherooControlProxy = new SwitcherooControlProxyClass(Gio.DBus.system,
        SWITCHEROO_CONTROL_BUS_NAME,
        '/net/hadess/SwitcherooControl',
        (proxy, error) => {
            if (error) {
                discreteGpuAvailable = false;
                log(error.message);
                return;
            }
            discreteGpuAvailable = SwitcherooControlProxy.HasDualGpu;
        });
}


const GnomeArchiveManagerInterface = `<node>
  <!-- org.gnome.ArchiveManager1:
       @short_description: Create and extract compressed archives
       This D-Bus interface is used to create and extract compressed archives.
    -->
    <interface name="org.gnome.ArchiveManager1">
    <!--
        GetSupportedTypes:
        @action: Can be one of the following values:
          *) create: create an archive that can contain many files.
          *) create_single_file: create an archive that can contain a single file.
          *) extract: extract the content of an archive.
        @types: The supported archive types described as an array of hash tables,
          where each hash table has the following keys:
          *) mime-type: the mime type relative to the archive type.
          *) default-extension: the extension to use for newly created archives.
          *) description: a human readable description of the archive type.
        Returns the supported archive types for a specific action.
      -->
    <method name="GetSupportedTypes">
      <arg name="action" type="s" direction="in"/>
      <arg name="types" type="aa{ss}" direction="out"/>
    </method>

    <!--
        AddToArchive:
        @archive: The archive URI.
        @files: The files to add to the archive, as an array of URIs.
        @use_progress_dialog: Whether to show the progress dialog.
        Adds the specified files to an archive.  If the archive already
        exists the archive is updated.
      -->
    <method name="AddToArchive">
      <arg name="archive" type="s" direction="in"/>
      <arg name="files" type="as" direction="in"/>
      <arg name="use_progress_dialog" type="b" direction="in"/>
    </method>

    <!--
        Compress:
        @files: The files to add to the archive, as an array of URIs.
        @destination: An optional destination, if not specified the folder of
          the first file in @files is used.
        @use_progress_dialog: Whether to show the progress dialog.
        Compresses a series of files in an archive. The user is asked to
        enter an archive name, archive type and other options.  In this case
        it's used the same dialog used by the "Compress..." command from the
        Nautilus context menu.
        If the user chooses an existing archive, the archive is updated.
      -->
    <method name='Compress'>
      <arg name="files" type="as" direction="in"/>
      <arg name="destination" type="s" direction="in"/>
      <arg name="use_progress_dialog" type="b" direction="in"/>
    </method>

    <!--
        Extract:
        @archive: The archive to extract.
        @destination: The location where to extract the archive.
        @use_progress_dialog: Whether to show the progress dialog.
        Extract an archive in a specified location.
      -->
    <method name="Extract">
      <arg name="archive" type="s" direction="in"/>
      <arg name="destination" type="s" direction="in"/>
      <arg name="use_progress_dialog" type="b" direction="in"/>
    </method>

    <!--
        ExtractHere:
        @archive: The archive to extract.
        @use_progress_dialog: Whether to show the progress dialog.
        Extract an archive in the archive's folder.
      -->
    <method name="ExtractHere">
      <arg name="archive" type="s" direction="in"/>
      <arg name="use_progress_dialog" type="b" direction="in"/>
    </method>

    <!--
        Progress:
        @fraction: number from 0.0 to 100.0 that indicates the percentage of
          completion of the operation.
        @details: text message that describes the current operation.
      -->
    <signal name="Progress">
      <arg name="fraction" type="d"/>
      <arg name="details" type="s"/>
    </signal>

  </interface>
</node>`;

const GnomeArchiveManagerProxyInterface = Gio.DBusProxy.makeProxyWrapper(GnomeArchiveManagerInterface);

function init() {
    NemoFileOperationsProxy = new NemoFileOperationsProxyInterface(
        Gio.DBus.session,
        'org.Nemo',
        '/org/Nemo',
        (proxy, error) => {
            if (error)
                log('Error connecting to Nemo');

        }
    );

    FreeDesktopFileManagerProxy = new FreeDesktopFileManagerProxyInterface(
        Gio.DBus.session,
        'org.freedesktop.FileManager1',
        '/org/freedesktop/FileManager1',
        (proxy, error) => {
            if (error)
                log('Error connecting to Nemo');

        }
    );

    GnomeNautilusPreviewProxy = new GnomeNautilusPreviewProxyInterface(
        Gio.DBus.session,
        'org.gnome.NautilusPreviewer',
        '/org/gnome/NautilusPreviewer',
        (proxy, error) => {
            if (error)
                log('Error connecting to Nautilus Previewer');

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

    GnomeArchiveManagerProxy = new GnomeArchiveManagerProxyInterface(
        Gio.DBus.session,
        'org.gnome.ArchiveManager1',
        '/org/gnome/ArchiveManager1',
        (proxy, error) => {
            if (error)
                log('Error connecting to ArchiveManager');

        }
    );
}
