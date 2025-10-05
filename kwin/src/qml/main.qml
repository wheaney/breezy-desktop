import QtQuick
import QtQuick3D
import org.kde.kwin as KWinComponents
import org.kde.kwin.effect.breezy_desktop

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
        "One",
        "One Pro",
        "SmartGlasses", // TCL/RayNeo
        "Rokid Max",
        "Rokid Max 2",
        "Rokid Air"
    ]
    required property QtObject effect
    required property QtObject targetScreen

    property real viewportDiagonalFOVDegrees: effect.diagonalFOV
    property var viewportResolution: effect.displayResolution
    property bool mirrorPhysicalDisplays: effect.mirrorPhysicalDisplays
    property var screens: KWinComponents.Workspace.screens.filter(function(screen) {
        return mirrorPhysicalDisplays || screen.name.includes("BreezyDesktop") || supportedModels.some(model => screen.model.includes(model));
    })

    // x value for placing the viewport in the middle of all screens
    property real screensXMid: {
        let xMin = Number.MAX_VALUE;
        let xMax = Number.MIN_VALUE;

        for (let i = 0; i < screens.length; i++) {
            const geometry = screens[i].geometry;
            xMin = Math.min(xMin, geometry.x);
            xMax = Math.max(xMax, geometry.x + geometry.width);
        }

        return (xMin + xMax) / 2 - (viewportResolution[0] / 2);
    }

    // y value for placing the viewport in the middle of all screens
    property real screensYMid: {
        let yMin = Number.MAX_VALUE;
        let yMax = Number.MIN_VALUE;

        for (let i = 0; i < screens.length; i++) {
            const geometry = screens[i].geometry;
            yMin = Math.min(yMin, geometry.y);
            yMax = Math.max(yMax, geometry.y + geometry.height);
        }

        return (yMin + yMax) / 2 - (viewportResolution[1] / 2);
    }

    Displays {
        id: displays
    }

    property var fovDetails: displays.buildFovDetails(
        screens,
        viewportResolution[0],
        viewportResolution[1],
        viewportDiagonalFOVDegrees,
        effect.lensDistanceRatio,
        effect.allDisplaysDistance,
        effect.displayWrappingScheme
    )

    property var monitorPlacements: {
        const dx = effect.displayHorizontalOffset * viewportResolution[0];
        const dy = effect.displayVerticalOffset * viewportResolution[1];
        const adjustedGeometries = screens.map(screen => {
            const g = screen.geometry;
            return {
                x: g.x - screensXMid + dx,
                y: g.y - screensYMid + dy,
                width: g.width,
                height: g.height
            };
        });
        return displays.monitorsToPlacements(fovDetails, adjustedGeometries, effect.displaySpacing);
    }

    property bool targetScreenSupported: supportedModels.some(model => root.targetScreen.model.includes(model))
    property bool targetScreenIsVirtual: targetScreen.name.includes("BreezyDesktop")
    property bool imuResetState: effect.imuResetState
    property bool isEnabled: effect.isEnabled

    Component {
        id: desktopViewComponent
        SingleDesktopView {
            supportsXR: targetScreenSupported
            showCalibratingBanner: isEnabled && imuResetState
        }
    }

    Component {
        id: view3DComponent
        View3D {
            anchors.fill: parent
            environment: SceneEnvironment {
                antialiasingMode: root.effect.antialiasingQuality === 0 ? SceneEnvironment.NoAA : SceneEnvironment.SSAA
                antialiasingQuality: root.effect.antialiasingQuality === 0 ? SceneEnvironment.Medium : (
                    root.effect.antialiasingQuality === 1 ? SceneEnvironment.Medium : (
                    root.effect.antialiasingQuality === 2 ? SceneEnvironment.High : SceneEnvironment.VeryHigh))
            }
            
            CustomCamera { 
                id: camera
            }

            BreezyDesktop {
                id: breezyDesktop
                screens: root.screens
                fovDetails: root.fovDetails
                monitorPlacements: root.monitorPlacements
            }

            CameraController {
                id: cameraController
                anchors.fill: parent
                camera: camera
                fovDetails: root.fovDetails
            }
        }
    }

    Loader {
        id: viewLoader
        anchors.fill: parent
    }

    function checkLoadedComponent() {
        console.log(`Breezy - checking screen ${targetScreen.model}: ${targetScreenSupported} ${targetScreenIsVirtual} ${isEnabled} ${imuResetState}`);
        const show3DView = targetScreenSupported && isEnabled && !imuResetState;
        if (!targetScreenIsVirtual) viewLoader.sourceComponent = show3DView ? view3DComponent : desktopViewComponent;
        if (targetScreenSupported) effect.effectTargetScreenIndex = KWinComponents.Workspace.screens.indexOf(targetScreen);
    }

    onScreensChanged: {
        checkLoadedComponent();
    }

    onImuResetStateChanged: {
        checkLoadedComponent();
    }

    onIsEnabledChanged: {
        checkLoadedComponent();
    }
    
    Component.onCompleted: {
        checkLoadedComponent();
    }
}
