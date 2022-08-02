extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
    'appIcons.js',
    'convenience.js',
    'intellihide.js',
    'overview.js',
    'panel.js',
    'panelManager.js',
    'panelPositions.js',
    'panelStyle.js',
    'prefs.js',
    'progress.js',
    'proximity.js',
    'taskbar.js',
    'tray.js',
    'transparency.js',
    'update.js',
    'utils.js',
    'windowPreview.js',
    'Settings.ui'
)

extension_dir = join_paths(extensiondir, uuid)
install_subdir('img', install_dir : extension_dir)

schema_data_dir = 'schemas'
subdir(schema_data_dir)
subdir('po')
