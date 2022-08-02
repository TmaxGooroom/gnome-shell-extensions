/* exported getIBusHangul, changeIBusPurposeToClutterPurpose */

const { Clutter, IBus } = imports.gi;
const Main = imports.ui.main;

function getIBusHangul() {
    let inputSourceManager = Main.inputMethod._inputSourceManager;
    let inputSources = inputSourceManager.inputSources;
    if (!inputSources)
        return null;

    for (let i of Object.keys(inputSources)) {
        let is = inputSources[i];
        if (is.type === 'ibus' && is.id === 'hangul')
            return inputSources[i];
    }

    return null;
}

function changeIBusPurposeToClutterPurpose(ibusPurpose) {
    switch (ibusPurpose) {
    case IBus.InputPurpose.FREE_FORM:
        return Clutter.InputContentPurpose.NORMAL;
    case IBus.InputPurpose.ALPHA:
        return Clutter.InputContentPurpose.ALPHA;
    case IBus.InputPurpose.DIGITS:
        return Clutter.InputContentPurpose.DIGITS;
    case IBus.InputPurpose.NUMBER:
        return Clutter.InputContentPurpose.NUMBER;
    case IBus.InputPurpose.PHONE:
        return Clutter.InputContentPurpose.PHONE;
    case IBus.InputPurpose.URL:
        return Clutter.InputContentPurpose.URL;
    case IBus.InputPurpose.EMAIL:
        return Clutter.InputContentPurpose.EMAIL;
    case IBus.InputPurpose.NAME:
        return Clutter.InputContentPurpose.NAME;
    case IBus.InputPurpose.PASSWORD:
        return Clutter.InputContentPurpose.PASSWORD;
    }

    return 0;
}
