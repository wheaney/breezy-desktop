import QtQuick
import QtQuick3D
import org.kde.kwin as KWinComponents
import org.kde.kwin.effect.breezy_desktop_effect

Item {
    id: root
    antialiasing: true
    focus: false

    readonly property var supportedModels: [
        "VITURE",
        "nreal air",
        "Air",
        "Air 2",
        "Air 2 Pro",
        "Air 2 Ultra",
        "SmartGlasses", // TCL/RayNeo
        "Rokid Max",
        "Rokid Air"
    ]
    required property QtObject effect
    required property QtObject targetScreen

    property real viewportDiagonalFOVDegrees: effect.diagonalFOV
    property var viewportResolution: effect.displayResolution
    property var screens: KWinComponents.Workspace.screens
    // .filter(function(screen) {
    //     return supportedModels.includes(screen.model);
    // })

    Displays {
        id: displays
    }

    property var fovDetails: displays.fovDetails(screens, viewportResolution[0], viewportResolution[1], viewportDiagonalFOVDegrees, effect.lensDistanceRatio)

    property var monitorPlacements: {
        const monitorSpacing = 0.0;
        return displays.monitorsToPlacements(fovDetails, screens.map(screen => screen.geometry), monitorSpacing);
    }

    Component {
        id: desktopViewComponent
        DesktopView {
            screen: root.targetScreen
            width: root.targetScreen.geometry.width
            height: root.targetScreen.geometry.height
        }
    }

    Component {
        id: view3DComponent
        View3D {
            anchors.fill: parent
            environment: SceneEnvironment {
                antialiasingMode: SceneEnvironment.MSAA
            }
            
            PerspectiveCamera { 
                id: camera
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
    }

    Loader {
        id: viewLoader
        anchors.fill: parent
    }
    
    Component.onCompleted: {
        const targetScreenSupported = supportedModels.some(model => root.targetScreen.model.endsWith(model));
        console.log(`Breezy - initialized with target screen: ${root.targetScreen.model}, supported: ${targetScreenSupported}`);

        viewLoader.sourceComponent = targetScreenSupported ? view3DComponent : desktopViewComponent;
    }
}
