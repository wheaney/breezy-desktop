add_library(xr_driver_ipc STATIC
    xrdriveripc.cpp
)

# Ensure position independent code so the static archive can link into the KWin effect plugin (a shared module)
set_target_properties(xr_driver_ipc PROPERTIES POSITION_INDEPENDENT_CODE ON)

# Generate an export header so symbols can be visible outside the shared lib
include(GenerateExportHeader)
generate_export_header(xr_driver_ipc EXPORT_FILE_NAME xr_driver_ipc_export.h)

target_include_directories(xr_driver_ipc
    PUBLIC
        ${CMAKE_CURRENT_BINARY_DIR} # for generated export header
)

target_compile_options(xr_driver_ipc PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/EHsc>
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-fexceptions>
)

target_link_libraries(xr_driver_ipc
    PRIVATE Qt6::Core
)

install(FILES xrdriveripc.py xrdriveripc_runner.py DESTINATION ${KDE_INSTALL_DATADIR}/kwin/effects/breezy_desktop)