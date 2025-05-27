/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

import QtQuick
import QtQuick3D

Model {
    id: face

    required property QtObject desktop
    required property int index
    required property size faceSize

    source: "#Rectangle"
    materials: [
        DefaultMaterial {
            cullMode: Material.NoCulling
            lighting: DefaultMaterial.NoLighting
            diffuseMap: Texture {
                sourceItem: DesktopView {
                    desktop: face.desktop
                    width: faceSize.width
                    height: faceSize.height
                }
            }
        }
    ]
}
