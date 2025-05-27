# SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>
#
# SPDX-License-Identifier: BSD-3-Clause

set(kwin_cube_config_SOURCES cubeeffectkcm.cpp)
ki18n_wrap_ui(kwin_cube_config_SOURCES cubeeffectkcm.ui)
qt_add_dbus_interface(kwin_cube_config_SOURCES ${KWIN_EFFECTS_INTERFACE} kwineffects_interface)

kcoreaddons_add_plugin(kwin_cube_config INSTALL_NAMESPACE "kwin/effects/configs" SOURCES ${kwin_cube_config_SOURCES})
kconfig_add_kcfg_files(kwin_cube_config ../cubeconfig.kcfgc)
target_link_libraries(kwin_cube_config
    KF6::ConfigCore
    KF6::ConfigGui
    KF6::ConfigWidgets
    KF6::CoreAddons
    KF6::GlobalAccel
    KF6::I18n
    KF6::KCMUtils
    KF6::XmlGui
)
