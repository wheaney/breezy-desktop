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

    property bool animationEnabled: false

    function start() {
        root.animationEnabled = true;
    }

    function stop() {
    }

    View3D {
        id: view
        anchors.fill: parent

        PerspectiveCamera { 
            id: camera
            fieldOfView: 22.55
        }

        BreezyDesktop {
            id: breezyDesktop
            viewportFOVHorizontal: 40.09
            viewportWidth: 1920
            viewportHeight: 1080
        }

        CameraController {
            id: cameraController
            anchors.fill: parent
            camera: camera
            radius: 0.5 * breezyDesktop.viewportHeight / Math.tan(camera.fieldOfView * Math.PI / 360)

            Behavior on rotation {
                enabled: !cameraController.busy && root.animationEnabled
                QuaternionAnimation {
                    id: rotationAnimation
                    duration: effect.animationDuration
                    easing.type: Easing.OutCubic
                }
            }
            Behavior on radius {
                NumberAnimation {
                    duration: effect.animationDuration
                    easing.type: Easing.OutCubic
                }
            }
        }
    }

    Component.onCompleted: start();
}
