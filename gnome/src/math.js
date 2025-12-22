export function degreeToRadian(degree) {
    return degree * Math.PI / 180;
}

// FOV in radians is spherical, so doesn't follow Pythagoras' theorem
export function diagonalToCrossFOVs(diagonalFOVRadians, aspectRatio) {
    // first convert from a spherical FOV to a diagonal FOV on a flat plane at a unit distance of 1.0
    const diagonalLengthUnitDistance = 2 * Math.tan(diagonalFOVRadians / 2);

    // then convert to flat plane horizontal and vertical FOVs
    const heightUnitDistance = diagonalLengthUnitDistance / Math.sqrt(1 + aspectRatio * aspectRatio);
    const widthUnitDistance = heightUnitDistance * aspectRatio;

    return {
        // then convert back to spherical FOV
        diagonalRadians: diagonalFOVRadians,
        horizontalRadians: 2 * Math.atan(widthUnitDistance / 2),
        verticalRadians: 2 * Math.atan(heightUnitDistance / 2),

        // flat values are relative to a unit distance of 1.0
        diagonalLengthUnitDistance,
        widthUnitDistance,
        heightUnitDistance
    }
}

const segmentsPerRadian = 20.0 / degreeToRadian(90.0);

// displays are placed around a circle, these functions help determine radians and distances from the original
// FOV measurements scaled to the display dimensions
export const fovConversionFns = {
    // convert curved FOV for flat displays
    flat: {
        // distance to an edge is the hypothenuse of the triangle where the opposite side is half the width of the reference fov screen
        centerToFovEdgeDistance: (centerDistance, fovLength) => Math.sqrt(Math.pow(fovLength / 2, 2) + Math.pow(centerDistance, 2)),
        fovEdgeToScreenCenterDistance: (edgeDistance, screenLength) => Math.sqrt(Math.pow(edgeDistance, 2) - Math.pow(screenLength / 2, 2)),
        lengthToRadians: (fovRadians, fovLength, screenEdgeDistance, toLength) => Math.asin(toLength / 2 / screenEdgeDistance) * 2,
        angleToLength: (fovRadians, fovLength, screenDistance, toAngleOpposite, toAngleAdjacent) => {
            return toAngleOpposite / toAngleAdjacent * screenDistance;
        },
        fovRadiansAtDistance: (fovRadians, unitLength, newScreenDistance) => {
            return 2 * Math.atan(unitLength / 2 / newScreenDistance);
        },
        radiansToSegments: (screenRadians) => 1
    },

    // convert curved FOV for curved displays, scaling either involves no change or is linear
    curved: {
        centerToFovEdgeDistance: (centerDistance, fovLength) => centerDistance,
        fovEdgeToScreenCenterDistance: (edgeDistance, screenLength) => edgeDistance,
        lengthToRadians: (fovRadians, fovLength, screenEdgeDistance, toLength) => fovRadians / fovLength * toLength,
        angleToLength: (fovRadians, fovLength, screenDistance, toAngleOpposite, toAngleAdjacent) => fovLength / fovRadians * Math.atan2(toAngleOpposite, toAngleAdjacent),
        fovRadiansAtDistance: (fovRadians, unitLength, newScreenDistance) => fovRadians / newScreenDistance,
        radiansToSegments: (screenRadians) => Math.ceil(screenRadians * segmentsPerRadian)
    }
}

export const applyQuaternionToVector = (vector, quaternion) => {
    const t = [
        2.0 * (quaternion[1] * vector[2] - quaternion[2] * vector[1]),
        2.0 * (quaternion[2] * vector[0] - quaternion[0] * vector[2]),
        2.0 * (quaternion[0] * vector[1] - quaternion[1] * vector[0])
    ];
    return [
        vector[0] + quaternion[3] * t[0] + quaternion[1] * t[2] - quaternion[2] * t[1],
        vector[1] + quaternion[3] * t[1] + quaternion[2] * t[0] - quaternion[0] * t[2],
        vector[2] + quaternion[3] * t[2] + quaternion[0] * t[1] - quaternion[1] * t[0]
    ];
}

export const vectorMagnitude = (vector) => {
    return Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
}

export const normalizeVector = (vector) => {
    const length = vectorMagnitude(vector);
    return [vector[0] / length, vector[1] / length, vector[2] / length];
}