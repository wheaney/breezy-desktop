import QtQuick
import QtQuick3D
import org.kde.kwin as KWinComponents
import org.kde.kwin.effect.breezy_desktop

Item {
    id: root
    antialiasing: true
    focus: false

    required property QtObject effect
    required property QtObject targetScreen

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            antialiasingMode: SceneEnvironment.MSAA
        }
        
        PerspectiveCamera { 
            id: camera
            frustumCullingEnabled: false
        }

        BreezyDesktop {
            id: breezyDesktop
        }

        CameraController {
            id: cameraController
            anchors.fill: parent
            camera: camera
        }
    }
    
    Component.onCompleted: start();
}
