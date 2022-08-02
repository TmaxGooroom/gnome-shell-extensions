extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
    'askConfirmPopup.js',
    'constants.js',
    'createThumbnail.js',
    'dbusUtils.js',
    'desktopGrid.js',
    'desktopIconsUtil.js',
    'desktopManager.js',
    'ding.js',
    'emulateX11WindowType.js',
    'enums.js',
    'extension.js',
    'fileItem.js',
    'prefs.js',
    'preferences.js',
    'renameView.js',
    'selectionCalculator.js',
    'showErrorPopup.js',
    'templateManager.js',
    'sortUtil.js',
)

subdir('po')

schema_data_dir = 'schemas'
subdir(schema_data_dir)

meson.add_install_script('meson_post_install.py')
