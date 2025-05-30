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

configure_file(
  input: 'virtualdisplay.in',
  output: 'virtualdisplay',
  configuration: conf,
  install: true,
  install_dir: get_option('bindir'),
  install_mode: 'r-xr-xr-x'
)

breezydesktop_sources = [
  '../modules/PyXRLinuxDriverIPC/xrdriveripc.py',
  '__init__.py',
  'configmanager.py',
  'connecteddevice.py',
  'customresolutiondialog.py',
  'customresolutiondialogcontent.py',
  'extensionsmanager.py',
  'displaydistancedialog.py',
  'displaydistancedialogcontent.py',
  'failedverification.py',
  'files.py',
  'license.py',
  'licensedialog.py',
  'licensedialogcontent.py',
  'licensefeaturerow.py',
  'licensetierrow.py',
  'main.py',
  'nodevice.py',
  'nodriver.py',
  'noextension.py',
  'nolicense.py',
  'settingsmanager.py',
  'shortcutdialog.py',
  'statemanager.py',
  'time.py',
  'virtualdisplay.py',
  'virtualdisplaymanager.py',
  'verify.py',
  'window.py'
]

install_data(breezydesktop_sources, install_dir: moduledir)
install_subdir('../lib', install_dir: moduledir)