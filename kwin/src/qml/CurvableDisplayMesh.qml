import QtQuick
import QtQuick3D
import QtQuick3D.Helpers

ProceduralMesh {
    id: mesh

    property var fovDetails
    property var monitorGeometry
    property var fovConversionFns

    property var _meshArrays: generateMesh()
    positions: _meshArrays.positions
    uv0s: _meshArrays.uvs
    indexes: _meshArrays.indices
    primitiveMode: ProceduralMesh.TriangleStrip

    onFovDetailsChanged: _meshArrays = generateMesh()
    onMonitorGeometryChanged: _meshArrays = generateMesh()
    onFovConversionFnsChanged: _meshArrays = generateMesh()

    function generateMesh() {
        if (!mesh.fovDetails || !mesh.monitorGeometry || !mesh.fovConversionFns)
            return { positions: [], uvs: [], indices: [] };

        const fov = mesh.fovDetails;
        const monitor = mesh.monitorGeometry;

        const horizontalWrap = fov.monitorWrappingScheme === 'horizontal';
        const horizontalConversions = horizontalWrap && fov.curvedDisplay ? fovConversionFns.curved : fovConversionFns.flat;

        const sideEdgeDistancePixels = horizontalConversions.centerToFovEdgeDistance(
            fov.completeScreenDistancePixels, fov.sizeAdjustedWidthPixels);
        const horizontalRadians = horizontalConversions.lengthToRadians(
            fov.defaultDistanceHorizontalRadians,
            fov.widthPixels,
            sideEdgeDistancePixels,
            monitor.width
        );

        const verticalWrap = fov.monitorWrappingScheme === 'vertical';
        const verticalConversions = verticalWrap && fov.curvedDisplay ? fovConversionFns.curved : fovConversionFns.flat;
        const topEdgeDistancePixels = verticalConversions.centerToFovEdgeDistance(
            fov.completeScreenDistancePixels, fov.sizeAdjustedHeightPixels);
        const verticalRadians = verticalConversions.lengthToRadians(
            fov.defaultDistanceVerticalRadians,
            fov.heightPixels,
            topEdgeDistancePixels,
            monitor.height
        );

        const positions = [];
        const uvs = [];
        const indices = [];

        const radius = fov.completeScreenDistancePixels;
        function vertexFor(s, t) {
            let z = 0;

            const xOffset = s - 0.5;
            let x = xOffset * monitor.width;
            if (fov.curvedDisplay && horizontalWrap) {
                const xOffsetRadians = xOffset * horizontalRadians;
                x = Math.sin(xOffsetRadians) * radius;
                z = radius - Math.cos(xOffsetRadians) * radius;
            }

            const yOffset = t - 0.5;
            let y = yOffset * monitor.height;
            if (fov.curvedDisplay && verticalWrap) {
                const yOffsetRadians = yOffset * verticalRadians;
                y = Math.sin(yOffsetRadians) * radius;
                z = radius - Math.cos(yOffsetRadians) * radius;
            }

            return { pos: Qt.vector3d(x, y, z), uv: Qt.vector2d(s, t) };
        }

        let segments = 1;
        if (horizontalWrap) segments = horizontalConversions.radiansToSegments(horizontalRadians);
        if (verticalWrap) segments = verticalConversions.radiansToSegments(verticalRadians);
        for (let i = 0; i <= segments; i++) {
            const texFraction = i / segments;

            // !verticalWrap also covers "flat" wrap scheme
            const texX0 = !verticalWrap ? texFraction : 0;
            const texX1 = !verticalWrap ? texFraction : 1;

            const texY0 = verticalWrap ? texFraction : 1;
            const texY1 = verticalWrap ? texFraction : 0;

            let vtxB = vertexFor(texX0, texY0);
            let vtxT = vertexFor(texX1, texY1);
            positions.push(vtxB.pos);
            positions.push(vtxT.pos);
            uvs.push(vtxB.uv);
            uvs.push(vtxT.uv);
        }

        return { positions: positions, uvs: uvs, indices: [] };
    }
}
