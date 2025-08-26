import QtQuick
import org.kde.kwin as KWinComponents

Item {
    id: desktopView

    required property QtObject screen

    function overlapsScreen(win, screenGeom) {
        if (!win) return false
        const winLeft = win.x
        const winTop = win.y
        const winRight = winLeft + win.width
        const winBottom = winTop + win.height

        const scrLeft = screenGeom.x
        const scrTop = screenGeom.y
        const scrRight = scrLeft + screenGeom.width
        const scrBottom = scrTop + screenGeom.height

        return winLeft < scrRight &&
               winRight > scrLeft &&
               winTop < scrBottom &&
               winBottom > scrTop
    }

    Repeater {
        model: KWinComponents.WindowFilterModel {
            activity: KWinComponents.Workspace.currentActivity
            desktop: KWinComponents.Workspace.currentDesktop
            windowModel: KWinComponents.WindowModel {}
        }

        KWinComponents.WindowThumbnail {
            // Only show if window overlaps this screen (any amount) and not minimized.
            readonly property bool onThisScreen: desktopView.overlapsScreen(model.window, desktopView.screen.geometry)

            wId: model.window.internalId
            x: model.window.x - desktopView.screen.geometry.x
            y: model.window.y - desktopView.screen.geometry.y
            z: model.window.stackingOrder
            visible: onThisScreen && !model.window.minimized
        }
    }
    Image {
        id: cursorImg
        source: effect.cursorImageSource
        cache: false
        visible: true // TODO - cursor position bounds check?
        x: effect.cursorPos.x - desktopView.screen.geometry.x
        y: effect.cursorPos.y - desktopView.screen.geometry.y
        z: 9999 // ensure on top
        anchors.centerIn: undefined

        layer.enabled: true
        layer.smooth: true
    }
}
