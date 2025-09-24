import QtQuick

Item {
    id: singleDesktopView
    property bool supportsXR: false
    property bool showCalibratingBanner: false

    DesktopView {
        id: desktopViewComponent
        screen: targetScreen
        width: targetScreen.geometry.width
        height: targetScreen.geometry.height
    }

    Image {
        source: effect.customBannerEnabled ? "custom_banner.png" : "calibrating.png"
        visible: supportsXR && showCalibratingBanner
        anchors.horizontalCenter: desktopViewComponent.horizontalCenter
        anchors.bottom: desktopViewComponent.bottom
    }
}