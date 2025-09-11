import QtQuick
import QtQuick3D

Item {
    id: root

    required property Camera camera
    required property var fovDetails

    property var displayResolution: effect.displayResolution
    property real diagonalFOV: effect.diagonalFOV
    property real lensDistanceRatio: effect.lensDistanceRatio
    property bool sbsEnabled: effect.sbsEnabled
    property bool customBannerEnabled: effect.customBannerEnabled

    implicitWidth: parent.width
    implicitHeight: parent.height

    Displays {
        id: displays
    }

    function updateCamera() {
        camera.eulerRotation = applyLookAhead(
            effect.imuRotations[0],
            effect.imuRotations[1],
            effect.imuTimeElapsedMs,
            lookAheadMS(effect.imuTimestamp, effect.lookAheadConfig, -1)
        );
        camera.position = effect.imuRotations[0].times(Qt.vector3d(0, 0, -fovDetails.lensDistancePixels));
    }

    // how far to look ahead is how old the IMU data is plus a constant that is either the default for this device or an override
    function lookAheadMS(imuDateMs, lookAheadConfig, override) {
        // how stale the imu data is
        const dataAge = Date.now() - imuDateMs;

        const lookAheadConstant = lookAheadConfig[0];
        const lookAheadMultiplier = lookAheadConfig[1];
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
        camera.fieldOfView = displays.radianToDegree(displays.diagonalToCrossFOVs(
            displays.degreeToRadian(root.diagonalFOV),
            aspectRatio
        ).vertical);
    }

    onDisplayResolutionChanged: updateFOV();
    onDiagonalFOVChanged: updateFOV();

    FrameAnimation {
        running: true
        onTriggered: {
            if (effect.imuRotations && effect.imuRotations.length > 0) {
                updateCamera();
            }
        }
    }
}
