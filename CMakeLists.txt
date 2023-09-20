cmake_minimum_required(VERSION 3.16)
project(breezyDesktop)

set(CMAKE_BUILD_TYPE Release)
set(THREADS_PREFER_PTHREAD_FLAG ON)
find_package(Threads REQUIRED)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_SOURCE_DIR}/cmake")
find_package(GStreamer REQUIRED)
find_package(GStreamerPluginsBase COMPONENTS video)
find_package(GLib REQUIRED)
find_package(GObject REQUIRED)
find_package(glfw3 3.3 CONFIG REQUIRED)
find_package(OpenGL REQUIRED)
find_package(X11 REQUIRED)

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
		${GSTREAMER_VIDEO_INCLUDE_DIR}
		${GLib_INCLUDE_DIRS}
		${GObject_INCLUDE_DIRS}
		${X11_INCLUDE_DIR}
		${OPENGL_INCLUDE_DIR}
)

target_link_libraries(breezyDesktop
		PRIVATE
		nrealAirLibrary
		Threads::Threads
		m
		${GSTREAMER_LIBRARY}
		${GSTREAMER_VIDEO_LIBRARY}
		${GLib_LIBRARY}
		${GObject_LIBRARY}
		glfw
		${OPENGL_LIBRARIES}
		${X11_LIBRARIES}
)