/*
 * extension descripttion. TBD.
 */

const { IBus } = imports.gi;

const Main = imports.ui.main;

const IBusManager = imports.misc.ibusManager;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const QwertyKeysyms = Me.imports.xkbcommon_keysyms.qwertyMap;

const HangulKiyeog = 0x0ea1;
const HangulJYeorinHieuh = 0x0efa;

function isKoreanCharactor(keyval) {
    if (keyval) {
        if (HangulKiyeog <= keyval && keyval <= HangulJYeorinHieuh)
            return true;
    }

    return false;
}

function krToUsKeysym(keyval) {
    if (isKoreanCharactor(keyval))
        return QwertyKeysyms[keyval];

    return keyval;
}

function getIBusHangul() {
    let inputSourceManager = Main.inputMethod._inputSourceManager;
    let inputSources = inputSourceManager.inputSources;
    if (!inputSources)
        return;

    let ibusHangul;

    let numInputSources = Object.keys(inputSources).length;
    for (let i = 0; i < numInputSources; i++) {
        if (inputSources[i].id === 'hangul') {
            ibusHangul = inputSources[i];
            break;
        }
    }

    return ibusHangul;
}

function getCurrentGroup() {
    let ibusHangul = getIBusHangul();
    let groupname;

    if (ibusHangul && ibusHangul.properties) {
        if (ibusHangul.properties.get(0).get_state() === 0)
            groupname = 'us';
        else
            groupname = 'kr';
    }

    return groupname;
}

function nextInputMethod() {
    let ibusHangul = getIBusHangul();

    if (!ibusHangul)
        return;

    let inputMethod = Main.inputMethod;
    if (inputMethod._currentSource !== ibusHangul) {
        let inputSourceManager = inputMethod._inputSourceManager;
        inputSourceManager.activateInputSource(ibusHangul, true);
    }

    let ibusManager = IBusManager.getIBusManager();
    ibusManager.activateProperty('InputMode', IBus.PropState.CHECKED);
}

function init() { // eslint-disable-line no-unused-vars
}

function enable() { // eslint-disable-line no-unused-vars
    let keyboard = Main.keyboard._keyboard;
    let controller = keyboard._keyboardController;

    controller._oldKeyvalPress = controller.keyvalPress;
    controller._oldKeyvalRelease = controller.keyvalRelease;

    // Change the keyval to english keyval.
    // Because the Hangul combination does not work properly if sending Korean charactor as it is.
    controller.keyvalPress = keyval => {
        controller._oldKeyvalPress(krToUsKeysym(keyval));
    };

    controller.keyvalRelease = keyval => {
        controller._oldKeyvalRelease(krToUsKeysym(keyval));
    };

    keyboard._oldPopupLanguageMenu = keyboard._popupLanguageMenu;
    keyboard._popupLanguageMenu = () => {
        nextInputMethod();
    };

    keyboard._ensureKeysForGroup('us');

    // Since 'xkbId' is a single value indicating which language the input method supports, so xkbId of ibus-hangul is always 'kr'.
    // This occurs that original _setActiveLayer() function shows only korean keyboard layout even if the actual InputMode is english.
    // So, temporarily change xkbId to match the InputMode of ibus-hangul and restore it.
    keyboard._oldSetActiveLayer = keyboard._setActiveLayer;
    keyboard._setActiveLayer = activeLevel => {
        let oldGroupName = controller._currentSource.xkbId;
        let newGroupname = getCurrentGroup();
        if (!newGroupname)
            newGroupname = oldGroupName;

        controller._currentSource.xkbId = newGroupname;
        keyboard._oldSetActiveLayer(activeLevel);
        controller._currentSource.xkbId = oldGroupName;
    };

}

function disable() { // eslint-disable-line no-unused-vars
    let keyboard = Main.keyboard._keyboard;
    let controller = keyboard._keyboardController;

    controller.keyvalPress = controller._oldKeyvalPress;
    controller.keyvalRelease = controller._oldKeyvalRelease;
    keyboard._setActiveLayer = keyboard._oldSetActiveLayer;
    keyboard._popupLanguageMenu = keyboard._oldPopupLanguageMenu;
    controller._oldKeyvalPress = null;
    controller._oldKeyvalRelease = null;
    keyboard._oldPopupLanguageMenu = null;
    keyboard._oldSetActiveLayer = null;
}
