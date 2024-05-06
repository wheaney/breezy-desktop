pkgdatadir = get_option('prefix') / get_option('datadir') / meson.project_name()
moduledir = pkgdatadir / 'breezydesktop'
gnome = import('gnome')

gnome.compile_resources('breezydesktop',
  'breezydesktop.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

python = import('python')

conf = configuration_data()
conf.set('PYTHON', python.find_installation('python3').full_path())
conf.set('VERSION', meson.project_version())
conf.set('localedir', get_option('prefix') / get_option('localedir'))
conf.set('pkgdatadir', pkgdatadir)

configure_file(
  input: 'breezydesktop.in',
  output: 'breezydesktop',
  configuration: conf,
  install: true,
  install_dir: get_option('bindir'),
  install_mode: 'r-xr-xr-x'
)

breezydesktop_sources = [
  '__init__.py',
  'connecteddevice.py',
  'main.py',
  'nodevice.py',
  'SettingsManager.py',
  'StateManager.py',
  'window.py',
  'XRDriverIPC.py'
]

install_data(breezydesktop_sources, install_dir: moduledir)