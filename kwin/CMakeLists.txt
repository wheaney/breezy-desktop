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
find_package(Qt6 REQUIRED COMPONENTS Core)

# Qt6 sets QT6_INSTALL_QML which is distro-aware
get_target_property(QT6_QMAKE_EXECUTABLE Qt6::qmake IMPORTED_LOCATION)
execute_process(
    COMMAND ${QT6_QMAKE_EXECUTABLE} -query QT_INSTALL_QML
    OUTPUT_VARIABLE QT6_QML_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

find_path(QT6_QUICK3D_QML_DIR
    NAMES QtQuick3D
    PATHS ${QT6_QML_DIR}
    NO_DEFAULT_PATH
)

if(NOT QT6_QUICK3D_QML_DIR)
    message(FATAL_ERROR "cmake could not find the QtQuick3D QML module.")
endif()

add_subdirectory(src)
ki18n_install(po)

feature_summary(WHAT ALL FATAL_ON_MISSING_REQUIRED_PACKAGES)

include(cmake/test.cmake)
include(cmake/pack.cmake)
