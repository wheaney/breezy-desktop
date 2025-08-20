add_subdirectory(kcm)

# Ensure C sources (wayland-*-protocol.c) are compiled
enable_language(C)

# ecm_add_qml_module ?
# ecm_target_qml_sources ?
kcoreaddons_add_plugin(breezy_desktop_effect INSTALL_NAMESPACE "kwin/effects/plugins/")

find_package(Wayland COMPONENTS Client)
find_package(KWayland REQUIRED)
find_package(Qt6 CONFIG REQUIRED COMPONENTS WaylandClient)

# Try to locate kde-screencast-unstable-v1.xml from PlasmaWaylandProtocols
find_package(PlasmaWaylandProtocols REQUIRED)
set(PWP_PROTOCOL_DIR "/usr/share/plasma-wayland-protocols")
set(PWP_PROTOCOL_XML "${PWP_PROTOCOL_DIR}/zkde-screencast-unstable-v1.xml")
if(EXISTS "${PWP_PROTOCOL_XML}")
    set(PROTOCOL_XML "${PWP_PROTOCOL_XML}")
else()
    set(PROTOCOL_XML "${CMAKE_CURRENT_SOURCE_DIR}/zkde-screencast-unstable-v1.xml")
endif()

qt6_generate_wayland_protocol_client_sources(breezy_desktop_effect
    PRIVATE_CODE FILES "${PROTOCOL_XML}"
)

target_sources(breezy_desktop_effect PRIVATE
    breezydesktopeffect.cpp
    kwaylandclient.cpp
    screencasting.cpp
    main.cpp
)
kconfig_add_kcfg_files(breezy_desktop_effect breezydesktopconfig.kcfgc)

target_include_directories(breezy_desktop_effect PRIVATE /usr/include/kwin)
target_link_libraries(breezy_desktop_effect
    Qt6::Core
    Qt6::Gui
    Qt6::Quick
    Qt6::WaylandClient

    KF6::ConfigCore
    KF6::ConfigGui
    KF6::CoreAddons
    KF6::GlobalAccel
    KF6::I18n
    KF6::WindowSystem

    KWin::kwin
    Plasma::KWaylandClient
)

install(DIRECTORY qml DESTINATION ${KDE_INSTALL_DATADIR}/kwin/effects/breezy_desktop_effect)
install(FILES metadata.json DESTINATION ${KDE_INSTALL_DATADIR}/kwin/effects/breezy_desktop_effect)
