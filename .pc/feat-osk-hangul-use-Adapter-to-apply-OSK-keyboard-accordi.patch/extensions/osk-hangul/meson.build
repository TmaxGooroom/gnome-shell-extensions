extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
  'xkbcommon_keysyms.js',
  'utils.js',
  'keyboardWrapper.js'
)

extension_dir = join_paths(extensiondir, uuid)
