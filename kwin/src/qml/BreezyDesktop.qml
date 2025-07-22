import QtQuick
import QtQuick3D
import org.kde.kwin as KWinComponents


Node {
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

    required property real viewportFOVHorizontal
    required property real viewportWidth
    required property real viewportHeight
    property real distance: viewportWidth / (2 * Math.tan(Math.PI * viewportFOVHorizontal / 360))
    property var screens: KWinComponents.Workspace.screens
    // .filter(function(screen) {
    //     return supportedModels.includes(screen.model);
    // })

    // x value for placing the viewport in the middle of all screens
    property real screensXMid: {
        let xMin = Number.MAX_VALUE;
        let xMax = Number.MIN_VALUE;

        for (let i = 0; i < screens.length; i++) {
            const geometry = screens[i].geometry;
            xMin = Math.min(xMin, geometry.x);
            xMax = Math.max(xMax, geometry.x + geometry.width);
        }

        return (xMin + xMax) / 2 - (viewportWidth / 2);
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

        return (yMin + yMax) / 2 - (viewportHeight / 2);
    }

    Repeater3D {
        model: screens.length
        delegate: BreezyDesktopDisplay {
            screen: screens[index]

            property real screenRotation: {
                const geometry = screen.geometry;
                const rot = (viewportFOVHorizontal / viewportWidth) * (geometry.x - screensXMid);
                console.log(`\t\t\tBreezy - screenRotation ${geometry.x} ${geometry.width} ${rot}`);
                return -rot;
            }

            property vector3d screenScale: {
                const geometry = screen.geometry;
                return Qt.vector3d(geometry.width / 100, geometry.height / 100, 1);
            }

            scale: screenScale
            eulerRotation.y: screenRotation
            position: {
                console.log(`\t\t\tBreezy - position ${distance} ${screenRotation}`);
                const transform = Qt.matrix4x4();
                transform.rotate(screenRotation, Qt.vector3d(0, 1, 0));
                const position = Qt.vector3d(0, 0, -distance);
                return transform.times(position).minus(position);
            }
        }
    }
}
