set(breezy_desktop_config_SOURCES breezydesktopeffectkcm.cpp)
ki18n_wrap_ui(breezy_desktop_config_SOURCES breezydesktopeffectkcm.ui)
qt_add_dbus_interface(breezy_desktop_config_SOURCES ${KWIN_EFFECTS_INTERFACE} kwineffects_interface)

kcoreaddons_add_plugin(breezy_desktop_config INSTALL_NAMESPACE "kwin/effects/configs" SOURCES ${breezy_desktop_config_SOURCES})
kconfig_add_kcfg_files(breezy_desktop_config ../breezydesktopconfig.kcfgc)
target_link_libraries(breezy_desktop_config
    KF6::ConfigCore
    KF6::ConfigGui
    KF6::ConfigWidgets
    KF6::CoreAddons
    KF6::GlobalAccel
    KF6::I18n
    KF6::KCMUtils
    KF6::XmlGui

    xr_driver_ipc
)
