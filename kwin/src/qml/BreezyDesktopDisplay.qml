import QtQuick
import QtQuick3D

Model {
    id: display

    required property QtObject screen
    required property var monitorPlacement
    required property int index

    property string cursorImageSource: effect.cursorImageSource
    property size cursorImageSize: effect.cursorImageSize
    property point cursorPos: effect.cursorPos

    source: "#Rectangle"
    materials: [
        CustomMaterial {
            id: customMat
            depthDrawMode: CustomMaterial.AlwaysDepthDraw
            shadingMode: CustomMaterial.Unshaded

            property real screenWidth: display.screen.geometry.width
            property real screenHeight: display.screen.geometry.height
            property real cursorX: display.cursorPos.x - display.screen.geometry.x
            property real cursorY: display.cursorPos.y - display.screen.geometry.y
            property real cursorW: display.cursorImageSize.width
            property real cursorH: display.cursorImageSize.height
            property bool showCursor: cursorX >= 0 && cursorX < screenWidth && cursorY >= 0 && cursorY < screenHeight

            property TextureInput desktopTex: TextureInput {
                texture: Texture {
                    sourceItem: DesktopView {
                        screen: display.screen
                        width: display.screen.geometry.width
                        height: display.screen.geometry.height
                    }
                }
            }
            property TextureInput cursorTex: TextureInput {
                texture: Texture {
                    sourceItem: Image {
                        source: effect.cursorImageSource
                        width: effect.cursorImageSize.width
                        height: effect.cursorImageSize.height
                    }
                }
            }

            fragmentShader: "cursorOverlay.frag"
            vertexShader: "cursorOverlay.vert"
        }
    ]
}
