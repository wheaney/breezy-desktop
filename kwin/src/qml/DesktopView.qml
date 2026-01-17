import QtQuick
import org.kde.kwin as KWinComponents

Item {
    id: desktopView

    required property var screen

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
        model: KWinComponents.WindowModel {}

        KWinComponents.WindowThumbnail {
            // Only show if window overlaps this screen (any amount) and not minimized.
            readonly property bool onThisActivity: model.window.activities.length === 0 || model.window.activities.includes(KWinComponents.Workspace.currentActivity)
            readonly property bool onThisDesktop: onThisActivity && (model.window.onAllDesktops || model.window.desktops.includes(KWinComponents.Workspace.currentDesktop))
            readonly property bool onThisScreen: onThisDesktop && desktopView.overlapsScreen(model.window, desktopView.screen.geometry)

            wId: model.window.internalId
            x: model.window.x - desktopView.screen.geometry.x
            y: model.window.y - desktopView.screen.geometry.y
            z: model.window.stackingOrder
            visible: onThisScreen && !model.window.minimized
        }
    }
}
