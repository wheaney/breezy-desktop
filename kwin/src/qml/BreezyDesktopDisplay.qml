import QtQuick
import QtQuick3D

Model {
    id: display

    required property QtObject screen
    required property var monitorPlacement
    required property int index

    source: "#Rectangle"
    materials: [
        DefaultMaterial {
            cullMode: Material.NoCulling
            lighting: DefaultMaterial.NoLighting
            diffuseMap: Texture {
                sourceItem: DesktopView {
                    screen: display.screen
                    width: display.screen.geometry.width
                    height: display.screen.geometry.height
                }
            }
        }
    ]
}
