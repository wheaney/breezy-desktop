/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#include "cubeeffect.h"
#include "effect/effect.h"
#include "effect/effecthandler.h"

#include <QAction>
#include <QFile>
#include <QLoggingCategory>
#include <QQuickItem>
#include <QTimer>

#include <KGlobalAccel>
#include <KLocalizedString>

Q_LOGGING_CATEGORY(KWIN_XR, "kwin.xr")

namespace KWin
{

CubeEffect::CubeEffect()
    : m_shutdownTimer(new QTimer(this))
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - constructor";
    qmlRegisterUncreatableType<CubeEffect>("org.kde.kwin.effect.cube", 1, 0, "CubeEffect", QStringLiteral("Cube cannot be created in QML"));

    m_shutdownTimer->setSingleShot(true);
    connect(m_shutdownTimer, &QTimer::timeout, this, &CubeEffect::realDeactivate);
    connect(effects, &EffectsHandler::screenAboutToLock, this, &CubeEffect::realDeactivate);

    const QKeySequence defaultToggleShortcut = Qt::META | Qt::Key_C;
    m_toggleAction = new QAction(this);
    m_toggleAction->setObjectName(QStringLiteral("Cube"));
    m_toggleAction->setText(i18n("Toggle Cube"));
    KGlobalAccel::self()->setDefaultShortcut(m_toggleAction, {defaultToggleShortcut});
    KGlobalAccel::self()->setShortcut(m_toggleAction, {defaultToggleShortcut});
    m_toggleShortcut = KGlobalAccel::self()->shortcut(m_toggleAction);
    connect(m_toggleAction, &QAction::triggered, this, &CubeEffect::toggle);

    connect(KGlobalAccel::self(), &KGlobalAccel::globalShortcutChanged, this, [this](QAction *action, const QKeySequence &seq) {
        if (action->objectName() == QStringLiteral("Cube")) {
            m_toggleShortcut.clear();
            m_toggleShortcut.append(seq);
        }
    });

    setSource(QUrl::fromLocalFile(QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/effects/cube/qml/main.qml"))));

    m_xrRotationTimer = new QTimer(this);
    m_xrRotationTimer->setInterval(16); // ~60Hz
    connect(m_xrRotationTimer, &QTimer::timeout, this, &CubeEffect::updateXrRotation);
    m_xrRotationTimer->start();
}

QVariantMap CubeEffect::initialProperties(Output *screen)
{
    return QVariantMap{
        {QStringLiteral("effect"), QVariant::fromValue(this)},
        {QStringLiteral("targetScreen"), QVariant::fromValue(screen)},
    };
}

int CubeEffect::requestedEffectChainPosition() const
{
    return 70;
}

void CubeEffect::grabbedKeyboardEvent(QKeyEvent *e)
{
    if (e->type() == QEvent::KeyPress) {
        if (m_toggleShortcut.contains(e->key() | e->modifiers())) {
            toggle();
            return;
        }
    }
    QuickSceneEffect::grabbedKeyboardEvent(e);
}

bool CubeEffect::borderActivated(ElectricBorder border)
{
    if (m_borderActivate.contains(border)) {
        toggle();
        return true;
    }
    return false;
}

void CubeEffect::toggle()
{
    if (isRunning()) {
        deactivate();
    } else {
        qCCritical(KWIN_XR) << "\t\t\tBreezy - activate";
        activate();
    }
}

void CubeEffect::activate()
{
    if (effects->isScreenLocked()) {
        return;
    }

    setRunning(true);

    // QuickSceneEffect grabs the keyboard and mouse input, which pulls focus away from the active window
    // and doesn't allow for interaction with anything on the desktop. These two calls fix that.
    // TODO - move away from QuickSceneEffect
    effects->ungrabKeyboard();
    effects->stopMouseInterception(this);
}

void CubeEffect::deactivate()
{
    if (m_shutdownTimer->isActive()) {
        return;
    }

    const QList<Output *> screens = effects->screens();
    for (Output *screen : screens) {
        if (QuickSceneView *view = viewForScreen(screen)) {
            QMetaObject::invokeMethod(view->rootItem(), "stop");
        }
    }

    m_shutdownTimer->start(animationDuration());
}

void CubeEffect::realDeactivate()
{
    setRunning(false);
}

int CubeEffect::animationDuration() const
{
    return 200;
}

qreal CubeEffect::cubeFaceDisplacement() const
{
    return 100;
}

qreal CubeEffect::distanceFactor() const
{
    return 1.5;
}

bool CubeEffect::mouseInvertedX() const
{
    return false;
}

bool CubeEffect::mouseInvertedY() const
{
    return false;
}

CubeEffect::BackgroundMode CubeEffect::backgroundMode() const
{
    return BackgroundMode::Color;
}

QColor CubeEffect::backgroundColor() const
{
    return QColor(Qt::black);
}

QQuaternion CubeEffect::xrRotation() const {
    return m_xrRotation;
}

void CubeEffect::updateXrRotation() {
    const QString shmPath = QStringLiteral("/dev/shm/breezy_desktop_imu");
    QFile shmFile(shmPath);
    
    if (!shmFile.open(QIODevice::ReadOnly)) {
        return;
    }
    
    QByteArray buffer = shmFile.readAll();
    shmFile.close();
    
    if (buffer.size() < 64) { // Minimum expected size based on the data structure
        return;
    }
    
    // Create a data view for reading binary data
    const char* data = buffer.constData();
    // Use proper data positions based on the original GJS layout
    // VERSION at offset 0, ENABLED at offset 1, etc.
    
    // Read version and enabled flags at their correct positions
    quint8 version = static_cast<quint8>(data[0]); // VERSION at offset 0
    quint8 enabledFlag = static_cast<quint8>(data[1]); // ENABLED at offset 1
    
    // DISPLAY_FOV is at offset: 1 + 1 + (4*4) + (4*2) = 26
    float displayFov;
    memcpy(&displayFov, data + 26, sizeof(float));
    
    // EPOCH_MS is at offset: 26 + 4 + 4 + 1 + 1 + 1 + (4*16) = 101
    quint64 imuDateMs;
    memcpy(&imuDateMs, data + 101, sizeof(quint64));
    imuDateMs = qFromLittleEndian(imuDateMs);
    
    // IMU_QUAT_DATA is at offset: 101 + 8 = 109
    float imuData[4];
    memcpy(imuData, data + 109, sizeof(imuData));
    
    // Validate data
    const quint64 currentTimeMs = QDateTime::currentMSecsSinceEpoch();
    const bool validKeepAlive = (currentTimeMs - imuDateMs) < 5000; // 5 second timeout
    const bool validData = validKeepAlive && displayFov != 0.0f;
    const quint8 expectedVersion = 4; // Define expected data layout version
    const bool enabled = (enabledFlag != 0) && (version == expectedVersion) && validData;
    
    if (!enabled) {
        return;
    }
    
    // Check for reset state (identity quaternion)
    const bool imuResetState = (imuData[0] == 0.0f && imuData[1] == 0.0f && 
                               imuData[2] == 0.0f && imuData[3] == 1.0f);
    
    if (imuResetState) {
        return;
    }
    
    // Create quaternion (w, x, y, z)
    QQuaternion quat(imuData[3], imuData[0], imuData[1], imuData[2]);
    
    if (quat != m_xrRotation) {
        m_xrRotation = quat;
        Q_EMIT xrRotationChanged();
    }
}

} // namespace KWin
