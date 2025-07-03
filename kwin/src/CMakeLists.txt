# SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>
#
# SPDX-License-Identifier: BSD-3-Clause

kcoreaddons_add_plugin(breezy_desktop_effect INSTALL_NAMESPACE "kwin/effects/plugins/")
target_sources(breezy_desktop_effect PRIVATE
    cubeeffect.cpp
    main.cpp
)

target_include_directories(breezy_desktop_effect PRIVATE /usr/include/kwin)
target_link_libraries(breezy_desktop_effect
    Qt6::Core
    Qt6::Gui
    Qt6::Quick

    KF6::CoreAddons
    KF6::GlobalAccel
    KF6::I18n
    KF6::WindowSystem

    KWin::kwin
)

install(DIRECTORY qml DESTINATION ${KDE_INSTALL_DATADIR}/kwin/effects/cube)
