add_subdirectory(kcm)
kpackage_install_package(package breezy_desktop_effect effects kwin)

kcoreaddons_add_plugin(breezy_desktop_effect INSTALL_NAMESPACE "kwin/effects/plugins/")
target_sources(breezy_desktop_effect PRIVATE
    breezydesktopeffect.cpp
    main.cpp
)
kconfig_add_kcfg_files(breezy_desktop_effect breezydesktopconfig.kcfgc)

target_include_directories(breezy_desktop_effect PRIVATE /usr/include/kwin)
target_link_libraries(breezy_desktop_effect
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
)
