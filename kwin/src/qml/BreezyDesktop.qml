import QtQuick
import QtQuick3D


Node {
    property var viewportResolution: effect.displayResolution
    property var screens: root.screens
    property var monitorPlacements: root.monitorPlacements

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


    Repeater3D {
        model: screens.length
        delegate: BreezyDesktopDisplay {
            screen: screens[index]
            monitorPlacement: monitorPlacements[index]

            property real screenRotationY: displays.radianToDegree(monitorPlacement.rotationAngleRadians.y)
            property real screenRotationX: displays.radianToDegree(monitorPlacement.rotationAngleRadians.x)

            property vector3d screenScale: {
                const geometry = screen.geometry;

                // apparently the default model unit size is 100x100, so we scale it up to the screen size
                return Qt.vector3d(geometry.width / 100, geometry.height / 100, 1);
            }

            scale: screenScale
            eulerRotation.y: screenRotationY
            eulerRotation.x: screenRotationX
            position: {
                // rotate about the Y (up) axis, to create a horizontal movement
                const transform = Qt.matrix4x4();
                transform.rotate(screenRotationY, Qt.vector3d(0, 1, 0));
                transform.rotate(screenRotationX, Qt.vector3d(1, 0, 0));

                // camera looks along the negative Z axis
                return transform.times(Qt.vector3d(-monitorPlacement.centerNoRotate[1], monitorPlacement.centerNoRotate[2], -monitorPlacement.centerNoRotate[0]));
            }
        }
    }
}
