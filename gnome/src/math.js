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