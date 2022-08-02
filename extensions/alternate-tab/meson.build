extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files('prefs.js',
  'switcher.js',
  'convenience.js'
)

extension_dir = join_paths(extensiondir, uuid)
install_subdir('media', install_dir : extension_dir)
