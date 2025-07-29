import QtQuick
import QtQuick3D

Item {
    id: root

    required property Camera camera

    property var imuRotations: effect.imuRotations
    property int imuTimeElapsedMs: effect.imuTimeElapsedMs
    property double imuTimestamp: effect.imuTimestamp  
    property var lookAheadConfig: effect.lookAheadConfig
    property var displayResolution: effect.displayResolution
    property real diagonalFOV: effect.diagonalFOV
    property real lensDistanceRatio: effect.lensDistanceRatio
    property bool sbsEnabled: effect.sbsEnabled
    property bool customBannerEnabled: effect.customBannerEnabled
    property bool useImuRotation: true // Set to true to use XR rotation when available

    implicitWidth: parent.width
    implicitHeight: parent.height

    function updateCamera(rotation) {
        camera.eulerRotation = rotation;
    }

    // how far to look ahead is how old the IMU data is plus a constant that is either the default for this device or an override
    function lookAheadMS(imuDateMs, lookAheadConstant, override) {
        // how stale the imu data is
        const dataAge = Date.now() - imuDateMs;

        return (override === -1 ? lookAheadConstant : override) + dataAge;
    }

    function applyLookAhead(quatT0, quatT1, elapsedTimeMs, lookAheadMs) {
        // convert both quats to euler angles
        const eulerT0 = quatT0.toEulerAngles();
        const eulerT1 = quatT1.toEulerAngles();

        // compute the rate of change of the angles based on the elapsed time
        const deltaX = (eulerT0.x - eulerT1.x);
        const deltaY = (eulerT0.y - eulerT1.y);
        const deltaZ = (eulerT0.z - eulerT1.z);

        // how much of the delta to apply based on the look-ahead time
        const timeConstant = lookAheadMs / elapsedTimeMs;

        return Qt.vector3d(
            eulerT0.x + deltaX * timeConstant,
            eulerT0.y + deltaY * timeConstant,
            eulerT0.z + deltaZ * timeConstant,
        );
    }

    function updateFOV() {
        const aspectRatio = displayResolution[0] / displayResolution[1];
        camera.fieldOfView = 2 * Math.atan(Math.tan(diagonalFOV * Math.PI / 360) / Math.sqrt(1 + aspectRatio * aspectRatio)) * 180 / Math.PI;
    }

    onDisplayResolutionChanged: updateFOV();
    onDiagonalFOVChanged: updateFOV();

    FrameAnimation {
        running: true
        onTriggered: {
            if (root.useImuRotation && root.imuRotations && root.imuRotations.length > 0) {
                updateCamera(applyLookAhead(
                    root.imuRotations[0],
                    root.imuRotations[1],
                    root.imuTimeElapsedMs,
                    lookAheadMS(root.imuTimestamp, root.lookAheadConfig[0], -1)
                ));
            }
        }
    }
}
