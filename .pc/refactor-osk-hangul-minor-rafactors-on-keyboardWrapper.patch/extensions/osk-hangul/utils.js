let Main = imports.ui.main;

function getIBusHangul() {  // eslint-disable-line no-unused-vars
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
