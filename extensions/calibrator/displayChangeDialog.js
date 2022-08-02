/* exported TmaxDisplayChangeDialog */
const { Clutter, GObject, Meta } = imports.gi;

const WindowManager = imports.ui.windowManager;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Calibrator = Me.imports.calibrator;

/* After Display changed at gnome-control-center, Gnome-shell pop up DisplayChangeDialog to confirm
 * user's decison.
 * After user's confirm decision, Calibrator should be called to calibrate touch setting.
 * In order to do this, we need replace DisplayChangeDialog.
 * So, we make new DisplayChangeDialog(TmaxDispalyChangeDialog), which is inherited old DisplayChangeDialog.
 * If we disable calibrator extension, the extension restore DisplayChangeDialog.
 */
var TmaxDisplayChangeDialog = GObject.registerClass(
    class DisplayChangeDialog extends WindowManager.DisplayChangeDialog {
        _init(wm) {
            super._init(wm);
            global.log('Tmax custom');

            /* Translators: this and the following message should be limited in length,
        to avoid ellipsizing the labels.
        */
            this.clearButtons();
            this._cancelButton = this.addButton({ label: _('Revert Settings'), // eslint-disable-line no-undef
                action: this._onFailure.bind(this),
                key: Clutter.KEY_Escape });
            this._okButton = this.addButton({ label: _('Keep Changes'), // eslint-disable-line no-undef
                action: this.onSuccess.bind(this),
                default: true });
        }

        onSuccess() {
            this._wm.complete_display_change(true);
            this.close();
            let manager = Meta.MonitorManager.get();
            if (manager.get_is_builtin_display_on()) {
                let panelIndex = manager.get_monitor_for_connector(Calibrator.connector[0]);
                if (Calibrator.WIDTH !== Main.layoutManager.monitors[panelIndex].width || Calibrator.HEIGHT !== Main.layoutManager.monitors[panelIndex].height) {
                    Calibrator.WIDTH = Main.layoutManager.monitors[panelIndex].width;
                    Calibrator.HEIGHT = Main.layoutManager.monitors[panelIndex].height;
                    Calibrator.asyncCalibrate();
                }
            }
        }
    });
