cmake_minimum_required(VERSION 3.16)
project(breezyDesktop)

set(CMAKE_BUILD_TYPE Release)
set(THREADS_PREFER_PTHREAD_FLAG ON)
find_package(Threads REQUIRED)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_SOURCE_DIR}/cmake")
find_package(GStreamer REQUIRED)
find_package(GLib REQUIRED)
find_package(GObject REQUIRED)

message(STATUS, "glib: ${GLib_LIBRARY}")

execute_process(COMMAND git submodule update --init --recursive
                WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
add_subdirectory(modules/xrealInterfaceLibrary/interface_lib)

add_executable(breezyDesktop
		src/main.cpp
)

target_include_directories(breezyDesktop
		SYSTEM BEFORE PRIVATE
		${CMAKE_CURRENT_SOURCE_DIR}/modules/xrealInterfaceLibrary/interface_lib/include
		${GSTREAMER_INCLUDE_DIRS}
		${GLib_INCLUDE_DIRS}
		${GObject_INCLUDE_DIRS}
)

target_link_libraries(breezyDesktop
		PRIVATE nrealAirLibrary Threads::Threads m ${GSTREAMER_LIBRARY} ${GLib_LIBRARY} ${GObject_LIBRARY}
)