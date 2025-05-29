/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#include "cubeeffect.h"
#include "cubeconfig.h"

#include <QAction>
#include <QFile>
#include <QQuickItem>
#include <QTimer>

#include <KGlobalAccel>
#include <KLocalizedString>

namespace KWin
{

CubeEffect::CubeEffect()
    : m_shutdownTimer(new QTimer(this))
{
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


    reconfigure(ReconfigureAll);

    m_xrRotationTimer = new QTimer(this);
    m_xrRotationTimer->setInterval(16); // ~60Hz
    connect(m_xrRotationTimer, &QTimer::timeout, this, &CubeEffect::updateXrRotation);
    m_xrRotationTimer->start();
}

void CubeEffect::reconfigure(ReconfigureFlags)
{
    CubeConfig::self()->read();
    setAnimationDuration(animationTime(200));
    setCubeFaceDisplacement(CubeConfig::cubeFaceDisplacement());
    setDistanceFactor(CubeConfig::distanceFactor() / 100.0);
    setMouseInvertedX(CubeConfig::mouseInvertedX());
    setMouseInvertedY(CubeConfig::mouseInvertedY());
    setSkybox(CubeConfig::skyBox());
    setBackgroundColor(CubeConfig::backgroundColor());

    switch (CubeConfig::background()) {
    case CubeConfig::EnumBackground::Skybox:
        setBackgroundMode(BackgroundMode::Skybox);
        break;
    case CubeConfig::EnumBackground::Color:
    default:
        setBackgroundMode(BackgroundMode::Color);
        break;
    }

    for (const ElectricBorder &border : qAsConst(m_borderActivate)) {
        effects->unreserveElectricBorder(border, this);
    }

    for (const ElectricBorder &border : qAsConst(m_touchBorderActivate)) {
        effects->unregisterTouchBorder(border, m_toggleAction);
    }

    m_borderActivate.clear();
    m_touchBorderActivate.clear();

    const QList<int> activateBorders = CubeConfig::borderActivate();
    for (const int &border : activateBorders) {
        m_borderActivate.append(ElectricBorder(border));
        effects->reserveElectricBorder(ElectricBorder(border), this);
    }

    const QList<int> touchActivateBorders = CubeConfig::touchBorderActivate();
    for (const int &border : touchActivateBorders) {
        m_touchBorderActivate.append(ElectricBorder(border));
        effects->registerTouchBorder(ElectricBorder(border), m_toggleAction);
    }
}

QVariantMap CubeEffect::initialProperties(EffectScreen *screen)
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
        activate();
    }
}

void CubeEffect::activate()
{
    if (effects->isScreenLocked()) {
        return;
    }
    if (effects->numberOfDesktops() < 3) {
        return;
    }

    setRunning(true);
}

void CubeEffect::deactivate()
{
    if (m_shutdownTimer->isActive()) {
        return;
    }

    const QList<EffectScreen *> screens = effects->screens();
    for (EffectScreen *screen : screens) {
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
    return m_animationDuration;
}

void CubeEffect::setAnimationDuration(int duration)
{
    if (m_animationDuration != duration) {
        m_animationDuration = duration;
        Q_EMIT animationDurationChanged();
    }
}

qreal CubeEffect::cubeFaceDisplacement() const
{
    return m_cubeFaceDisplacement;
}

void CubeEffect::setCubeFaceDisplacement(qreal displacement)
{
    if (m_cubeFaceDisplacement != displacement) {
        m_cubeFaceDisplacement = displacement;
        Q_EMIT cubeFaceDisplacementChanged();
    }
}

qreal CubeEffect::distanceFactor() const
{
    return m_distanceFactor;
}

void CubeEffect::setDistanceFactor(qreal factor)
{
    if (m_distanceFactor != factor) {
        m_distanceFactor = factor;
        Q_EMIT distanceFactorChanged();
    }
}

bool CubeEffect::mouseInvertedX() const
{
    return m_mouseInvertedX;
}

void CubeEffect::setMouseInvertedX(bool inverted)
{
    if (m_mouseInvertedX != inverted) {
        m_mouseInvertedX = inverted;
        Q_EMIT mouseInvertedXChanged();
    }
}

bool CubeEffect::mouseInvertedY() const
{
    return m_mouseInvertedY;
}

void CubeEffect::setMouseInvertedY(bool inverted)
{
    if (m_mouseInvertedY != inverted) {
        m_mouseInvertedY = inverted;
        Q_EMIT mouseInvertedYChanged();
    }
}

CubeEffect::BackgroundMode CubeEffect::backgroundMode() const
{
    return m_backgroundMode;
}

void CubeEffect::setBackgroundMode(BackgroundMode mode)
{
    if (m_backgroundMode != mode) {
        m_backgroundMode = mode;
        Q_EMIT backgroundModeChanged();
    }
}

QUrl CubeEffect::skybox() const
{
    return m_skybox;
}

void CubeEffect::setSkybox(const QUrl &url)
{
    if (m_skybox != url) {
        m_skybox = url;
        Q_EMIT skyboxChanged();
    }
}

QColor CubeEffect::backgroundColor() const
{
    return m_backgroundColor;
}

void CubeEffect::setBackgroundColor(const QColor &color)
{
    if (m_backgroundColor != color) {
        m_backgroundColor = color;
        Q_EMIT backgroundColorChanged();
    }
}

QQuaternion CubeEffect::xrRotation() const {
    return m_xrRotation;
}

void CubeEffect::updateXrRotation() {
    // Example: Read quaternion from /dev/shm/breezy_xr_quat (float32[4], binary)
    QFile shmFile("/dev/shm/breezy_xr_quat");
    if (shmFile.open(QIODevice::ReadOnly)) {
        float data[4];
        if (shmFile.read(reinterpret_cast<char*>(data), sizeof(data)) == sizeof(data)) {
            QQuaternion quat(data[3], data[0], data[1], data[2]); // w, x, y, z
            if (quat != m_xrRotation) {
                m_xrRotation = quat;
                Q_EMIT xrRotationChanged();
            }
        }
        shmFile.close();
    }
}

} // namespace KWin
