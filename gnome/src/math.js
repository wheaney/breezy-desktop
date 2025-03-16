export function degreeToRadian(degree) {
    return degree * Math.PI / 180;
}

// FOV in radians is spherical, so doesn't follow Pythagoras' theorem
export function diagonalToCrossFOVs(diagonalFOVRadians, aspectRatio) {
    // first convert from a spherical FOV to a diagonal FOV on a flat plane at a generic distance of 1.0
    const flatDiagonalFOV = 2 * Math.tan(diagonalFOVRadians / 2);

    // then convert to flat plane horizontal and vertical FOVs
    const flatVerticalFOV = flatDiagonalFOV / Math.sqrt(1 + aspectRatio * aspectRatio);
    const flatHorizontalFOV = flatVerticalFOV * aspectRatio;

    // then convert back to spherical FOV
    return {
        diagonal: diagonalFOVRadians,
        horizontal: 2 * Math.atan(Math.tan(flatHorizontalFOV / 2)),
        vertical: 2 * Math.atan(Math.tan(flatVerticalFOV / 2))
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
            return toAngleOpposite / toAngleAdjacent * screenDistance
        },
        radiansToSegments: (screenRadians) => 1
    },

    // convert curved FOV for curved displays, scaling either involves no change or is linear
    curved: {
        centerToFovEdgeDistance: (centerDistance, fovLength) => centerDistance,
        fovEdgeToScreenCenterDistance: (edgeDistance, screenLength) => edgeDistance,
        lengthToRadians: (fovRadians, fovLength, screenEdgeDistance, toLength) => fovRadians / fovLength * toLength,
        angleToLength: (fovRadians, fovLength, screenDistance, toAngleOpposite, toAngleAdjacent) => fovLength / fovRadians * Math.atan2(toAngleOpposite, toAngleAdjacent),
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

export const normalizeVector = (vector) => {
    const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
    return [vector[0] / length, vector[1] / length, vector[2] / length];
}