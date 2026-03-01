set(breezy_desktop_config_SOURCES
    breezydesktopeffectkcm.cpp
    labeledslider.cpp
    customresolutiondialog.cpp
    virtualdisplayrow.cpp
)
ki18n_wrap_ui(breezy_desktop_config_SOURCES
    breezydesktopeffectkcm.ui
    customresolutiondialog.ui
    virtualdisplayrow.ui
)
qt_add_dbus_interface(breezy_desktop_config_SOURCES ${KWIN_EFFECTS_INTERFACE} kwineffects_interface)

kcoreaddons_add_plugin(breezy_desktop_config INSTALL_NAMESPACE "plasma/kcms" SOURCES ${breezy_desktop_config_SOURCES})
kconfig_add_kcfg_files(breezy_desktop_config ../breezydesktopconfig.kcfgc)
target_link_libraries(breezy_desktop_config
    Qt6::DBus
    Qt6::Network
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

# Ensure the version macro is available to the KCM as well (defined in parent CMakeLists)
if(BREEZY_DESKTOP_VERSION)
    target_compile_definitions(breezy_desktop_config PRIVATE BREEZY_DESKTOP_VERSION_STR=\"${BREEZY_DESKTOP_VERSION}\")
endif()

set(KCMSHELL "kcmshell6")
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/breezy_desktop.desktop.in
    ${CMAKE_CURRENT_BINARY_DIR}/breezy_desktop.desktop
    @ONLY
)
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/breezy_desktop.desktop
        DESTINATION ${KDE_INSTALL_APPDIR})
install(FILES ${CMAKE_CURRENT_SOURCE_DIR}/com.xronlinux.BreezyDesktop.svg
        DESTINATION ${KDE_INSTALL_ICONDIR}/hicolor/scalable/apps)