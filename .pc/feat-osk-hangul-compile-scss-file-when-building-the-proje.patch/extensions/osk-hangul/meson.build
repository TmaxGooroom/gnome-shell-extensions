sassc = find_program('sassc')
style = custom_target('stylesheet.css',
                      input: '_stylesheet.scss',
                      output: 'stylesheet.css',
                      command: [
                        sassc, '-a', '@INPUT@', '@OUTPUT@'
                      ],
                      install: true,
                      install_dir:meson.current_source_dir() )

extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
  'qwertyMap.js',
  'utils.js',
  'keyboardWrapper.js',
  'adapter.js',
  'keyButton.js',
)
