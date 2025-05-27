# SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>
#
# SPDX-License-Identifier: BSD-3-Clause

add_subdirectory(kcm)

kcoreaddons_add_plugin(kwin4_effect_cube INSTALL_NAMESPACE "kwin/effects/plugins/")
target_sources(kwin4_effect_cube PRIVATE
    cubeeffect.cpp
    main.cpp
)
kconfig_add_kcfg_files(kwin4_effect_cube cubeconfig.kcfgc)

target_link_libraries(kwin4_effect_cube
    Qt6::Core
    Qt6::Gui
    Qt6::Quick

    KF6::ConfigCore
    KF6::ConfigGui
    KF6::CoreAddons
    KF6::GlobalAccel
    KF6::I18n
    KF6::WindowSystem

    kwineffects
)

install(DIRECTORY qml DESTINATION ${KDE_INSTALL_DATADIR}/kwin/effects/cube)
