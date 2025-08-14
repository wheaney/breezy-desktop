import QtQuick
import org.kde.kwin as KWinComponents

Item {
    id: desktopView

    required property QtObject screen

    Repeater {
        model: KWinComponents.WindowFilterModel {
            activity: KWinComponents.Workspace.currentActivity
            desktop: KWinComponents.Workspace.currentDesktop
            screenName: desktopView.screen.name
            windowModel: KWinComponents.WindowModel {}
        }

        KWinComponents.WindowThumbnail {
            wId: model.window.internalId
            x: model.window.x - desktopView.screen.geometry.x
            y: model.window.y - desktopView.screen.geometry.y
            z: model.window.stackingOrder
            visible: !model.window.minimized
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
