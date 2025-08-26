add_subdirectory(xrdriveripc)
add_subdirectory(kcm)

kcoreaddons_add_plugin(breezy_desktop INSTALL_NAMESPACE "kwin/effects/plugins/")
target_sources(breezy_desktop PRIVATE
    breezydesktopeffect.cpp
    main.cpp
)
kconfig_add_kcfg_files(breezy_desktop breezydesktopconfig.kcfgc)

# Split KWin version into numeric components (major, minor, patch)
string(REGEX MATCHALL "[0-9]+" KWIN_VERSION_COMPONENTS "${KWin_VERSION}")

# defaults
set(KWIN_VERSION_MAJOR 0)
set(KWIN_VERSION_MINOR 0)
set(KWIN_VERSION_PATCH 0)

list(LENGTH KWIN_VERSION_COMPONENTS _kwin_version_len)
if(_kwin_version_len GREATER 0)
    list(GET KWIN_VERSION_COMPONENTS 0 KWIN_VERSION_MAJOR)
endif()
if(_kwin_version_len GREATER 1)
    list(GET KWIN_VERSION_COMPONENTS 1 KWIN_VERSION_MINOR)
endif()
if(_kwin_version_len GREATER 2)
    list(GET KWIN_VERSION_COMPONENTS 2 KWIN_VERSION_PATCH)
endif()

# optional: a single encoded integer (major*10000 + minor*100 + patch)
math(EXPR KWIN_VERSION_ENCODED "${KWIN_VERSION_MAJOR} * 10000 + ${KWIN_VERSION_MINOR} * 100 + ${KWIN_VERSION_PATCH}")

# Export as compile definitions. Keep the original string macro as well.
target_compile_definitions(breezy_desktop PRIVATE
        KWIN_VERSION_STR=\"${KWin_VERSION}\"
        KWIN_VERSION_MAJOR=${KWIN_VERSION_MAJOR}
        KWIN_VERSION_MINOR=${KWIN_VERSION_MINOR}
        KWIN_VERSION_PATCH=${KWIN_VERSION_PATCH}
        KWIN_VERSION_ENCODED=${KWIN_VERSION_ENCODED}
)
target_include_directories(breezy_desktop PRIVATE /usr/include/kwin)
target_include_directories(breezy_desktop PRIVATE xrdriveripc)
target_link_libraries(breezy_desktop
    Qt6::Core
    Qt6::Gui
    Qt6::Quick

    KF6::ConfigCore
    KF6::ConfigGui
    KF6::CoreAddons
    KF6::GlobalAccel
    KF6::I18n
    KF6::WindowSystem

    KWin::kwin

    xr_driver_ipc
)


install(DIRECTORY qml DESTINATION ${KDE_INSTALL_DATADIR}/kwin/effects/breezy_desktop)