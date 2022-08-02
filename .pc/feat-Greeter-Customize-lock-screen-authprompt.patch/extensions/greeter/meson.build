extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
    'loginDialog.js',
    'authPrompt.js',
    'userProfile.js',
    'userVerifier.js',
    'constants.js'
)

extension_dir = join_paths(extensiondir, uuid)
install_subdir('media', install_dir : extension_dir)
