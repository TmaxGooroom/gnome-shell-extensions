extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
    'menuWidgets.js',
    'baseMenuLayout.js',
    'menuButton.js',
    'constants.js',
    'controller.js',
    'convenience.js',
    'utils.js',
    'search.js',
    'searchMenuLayout.js'
)

extension_dir = join_paths(extensiondir, uuid)
install_subdir('media', install_dir : extension_dir)

schema_data_dir = 'schemas'
subdir(schema_data_dir)
