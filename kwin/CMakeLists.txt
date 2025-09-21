cmake_minimum_required(VERSION 3.20)

project(breezy_desktop VERSION 0.0.1 LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include(cmake/default-vars.cmake)

find_package(ECM "5.100" REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH
        ${CMAKE_MODULE_PATH}
        ${ECM_MODULE_PATH}
        ${ECM_KDE_MODULE_DIR}
)
include(FeatureSummary)
include(KDEInstallDirs)
include(KDECMakeSettings)
include(KDECompilerSettings NO_POLICY_SCOPE)

# required frameworks by Core
find_package(KF6 REQUIRED COMPONENTS
    Config
    ConfigWidgets
    CoreAddons
    GlobalAccel
    I18n
    KCMUtils
    WindowSystem
    XmlGui
)

find_package(KWin REQUIRED COMPONENTS kwineffects)
message(STATUS "Found KWin Version: ${KWin_VERSION}")
include(cmake/info.cmake)
find_package(epoxy REQUIRED)
find_package(XCB REQUIRED COMPONENTS XCB)
find_package(KWinDBusInterface CONFIG REQUIRED)

find_library(QT6_QUICK3D_LIB
    NAMES Qt6Quick3D Qt6Quick3D.so Qt6Quick3D.so.6
    PATH_SUFFIXES lib
)
if(NOT QT6_QUICK3D_LIB)
    message(FATAL_ERROR "Qt6 Quick3D runtime library not found (QtQuick3D). Please install the Qt6 Quick3D runtime.")
endif()
set_package_properties(Qt6Quick3D PROPERTIES
    TYPE RUNTIME
    PURPOSE "Required at runtime for 3D rendering (Qt Quick 3D)."
)

add_subdirectory(src)
ki18n_install(po)

feature_summary(WHAT ALL FATAL_ON_MISSING_REQUIRED_PACKAGES)

include(cmake/test.cmake)
include(cmake/pack.cmake)
