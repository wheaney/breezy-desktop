# these are cache variables, so they could be overwritten with -D,
set(CPACK_PACKAGE_NAME ${CMAKE_PROJECT_NAME} CACHE STRING ${CMAKE_PROJECT_NAME})
set(CPACK_PACKAGING_INSTALL_PREFIX "/usr")
set(CPACK_PACKAGE_FILE_NAME "${CMAKE_PROJECT_NAME}")
set(CPACK_PACKAGE_VERSION "${CMAKE_PROJECT_VERSION}")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Breezy Desktop - KWin Plugin")
set(CPACK_PACKAGE_CONTACT "wayne@xronlinux.com")

set(CPACK_DEBIAN_PACKAGE_MAINTAINER "Wayne Heaney")
set(CPACK_DEBIAN_PACKAGE_SECTION "kde")

# autogenerate dependency information
set(CPACK_DEBIAN_PACKAGE_SHLIBDEPS ON)
set(CPACK_DEBIAN_PACKAGE_GENERATE_SHLIBS ON)
set(CPACK_DEBIAN_PACKAGE_GENERATE_SHLIBS_POLICY "=")

include(CPack)
# To generate deb files, install 'dpkg-dev' package and then run 'cpack -G DEB'