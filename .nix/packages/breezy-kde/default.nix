{
  self,
  version,
  lib,
  stdenv,
  fetchFromGitHub,
  cmake,
  pkg-config,
  kdePackages,
  libepoxy,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "breezy-kwin";
  inherit version;

  src = self;

  sourceRoot = ".";

  unpackPhase = ''
    cp -r $src $TMPDIR/breezy-desktop
    chmod -R u+w $TMPDIR/breezy-desktop
    cd $TMPDIR/breezy-desktop/kwin
  '';

  nativeBuildInputs = [
    cmake
    kdePackages.extra-cmake-modules
    kdePackages.wrapQtAppsHook
    pkg-config
  ];

  buildInputs = with kdePackages; [
    kconfig
    kconfigwidgets
    kcoreaddons
    kglobalaccel
    ki18n
    kcmutils
    kwindowsystem
    kxmlgui
    kwin
    qtbase
    qtdeclarative
    qt3d
    qtquick3d
    libepoxy
  ];

  postPatch = ''
        # VERSION is read relative to kwin/src/../VERSION = kwin/VERSION
        # and also from kwin/../VERSION for the top-level CMakeLists.txt
        echo "${finalAttrs.version}" > ../VERSION
        echo "${finalAttrs.version}" > VERSION

        # Copy files expected by CMake install but located elsewhere in the mono-repo
        cp ../ui/modules/PyXRLinuxDriverIPC/xrdriveripc.py src/xrdriveripc/xrdriveripc.py
        cp ../ui/data/icons/hicolor/scalable/apps/com.xronlinux.BreezyDesktop.svg src/kcm/com.xronlinux.BreezyDesktop.svg

        # Fix hardcoded /usr/include/kwin path
        substituteInPlace cmake/info.cmake \
          --replace-fail '/usr/include/kwin/effect/effect.h' \
                         '${kdePackages.kwin.dev}/include/kwin/effect/effect.h'

        # Fix QtQuick3D QML module detection - bypass qmake query
        substituteInPlace CMakeLists.txt \
          --replace-fail 'execute_process(
        COMMAND ''${QT6_QMAKE_EXECUTABLE} -query QT_INSTALL_QML
        OUTPUT_VARIABLE QT6_QML_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )' 'set(QT6_QML_DIR "${kdePackages.qtquick3d}/lib/qt-6/qml")'

        # Remove the hardcoded /usr/include reference
        substituteInPlace src/CMakeLists.txt \
          --replace-fail 'target_include_directories(breezy_desktop PRIVATE /usr/include/kwin)' \
                         'target_include_directories(breezy_desktop PRIVATE ${kdePackages.kwin.dev}/include/kwin)'
  '';

  cmakeFlags = [
    "-DCMAKE_BUILD_TYPE=Release"
  ];

  meta = {
    description = "KWin effect plugin for Breezy Desktop XR virtual display";
    homepage = "https://github.com/wheaney/breezy-desktop";
    license = lib.licenses.gpl3Only;
    platforms = lib.platforms.linux;
  };
})
