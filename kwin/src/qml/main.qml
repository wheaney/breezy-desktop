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

    DesktopView {
        id: desktopView
        screen: root.targetScreen
        width: root.targetScreen.geometry.width
        height: root.targetScreen.geometry.height
    }

    View3D {
        id: view3D
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
            targetScreen: root.targetScreen
        }

        CameraController {
            id: cameraController
            anchors.fill: parent
            camera: camera
        }
    }
    
    // TODO - make it so the View3D isn't loaded unless it's a supported screen
    Component.onCompleted: {
        console.log(`Breezy -  initialized with target screen: ${breezyDesktop.targetScreen.model}, supported: ${breezyDesktop.targetScreenSupported}`);
        view3D.opacity = breezyDesktop.targetScreenSupported ? 1.0 : 0.0;
        desktopView.opacity = breezyDesktop.targetScreenSupported ? 0.0 : 1.0;
    }
}
