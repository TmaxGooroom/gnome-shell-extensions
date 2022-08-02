# Add Logging Module to TOS Extensions
foreach e : tos_extensions
  uuid = e + uuid_suffix
  install_data (
    'logging.js',
    install_dir: join_paths(extensiondir, uuid)
  )
endforeach
