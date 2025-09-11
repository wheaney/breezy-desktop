import QtQuick

Item {
    id: singleDesktopView
    property point cursorPos: effect.cursorPos
    property bool supportsXR: false
    property bool showCalibratingBanner: false

    function cursorInBounds() {
        const x = cursorPos.x
        const y = cursorPos.y
        const screenGeom = targetScreen.geometry
        return x >= screenGeom.x &&
               x < screenGeom.x + screenGeom.width &&
               y >= screenGeom.y &&
               y < screenGeom.y + screenGeom.height
    }

    DesktopView {
        id: desktopViewComponent
        screen: targetScreen
        width: targetScreen.geometry.width
        height: targetScreen.geometry.height
    }
    
    Image {
        id: cursorImg
        x: 0
        y: 0
        z: 9999 // ensure on top
    }

    Image {
        source: effect.customBannerEnabled ? "custom_banner.png" : "calibrating.png"
        visible: supportsXR && showCalibratingBanner
        anchors.horizontalCenter: desktopViewComponent.horizontalCenter
        anchors.bottom: desktopViewComponent.bottom
    }

    onCursorPosChanged: {
        if (singleDesktopView.cursorInBounds()) {
            const newX = effect.cursorPos.x - targetScreen.geometry.x
            const newY = effect.cursorPos.y - targetScreen.geometry.y
            const newSrc = effect.cursorImageSource
            if (cursorImg.x !== newX) cursorImg.x = newX
            if (cursorImg.y !== newY) cursorImg.y = newY
            if (cursorImg.source !== newSrc) cursorImg.source = newSrc
            if (!cursorImg.visible) cursorImg.visible = true
        } else if (cursorImg.visible) {
            cursorImg.visible = false
        }
    }
}