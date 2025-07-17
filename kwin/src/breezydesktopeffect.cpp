#include "breezydesktopeffect.h"
#include "effect/effect.h"
#include "effect/effecthandler.h"
#include "opengl/glutils.h"
#include "core/rendertarget.h"
#include "core/renderviewport.h"

#include <QAction>
#include <QFile>
#include <QFileSystemWatcher>
#include <QLoggingCategory>
#include <QQuickItem>
#include <QTimer>

#include <KGlobalAccel>
#include <KLocalizedString>
#include <qt/QtCore/qbuffer.h>

Q_LOGGING_CATEGORY(KWIN_XR, "kwin.xr")

using namespace std::chrono_literals;

namespace KWin
{

BreezyDesktopEffect::BreezyDesktopEffect()
    : m_shutdownTimer(new QTimer(this))
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - constructor";
    qmlRegisterUncreatableType<BreezyDesktopEffect>("org.kde.kwin.effect.breezy_desktop", 1, 0, "BreezyDesktopEffect", QStringLiteral("BreezyDesktop cannot be created in QML"));

    m_shutdownTimer->setSingleShot(true);
    connect(m_shutdownTimer, &QTimer::timeout, this, &BreezyDesktopEffect::realDeactivate);
    connect(effects, &EffectsHandler::screenAboutToLock, this, &BreezyDesktopEffect::realDeactivate);

    const QKeySequence defaultToggleShortcut = Qt::META | Qt::Key_B;
    m_toggleAction = new QAction(this);
    m_toggleAction->setObjectName(QStringLiteral("BreezyDesktop"));
    m_toggleAction->setText(i18n("Toggle BreezyDesktop"));
    KGlobalAccel::self()->setDefaultShortcut(m_toggleAction, {defaultToggleShortcut});
    KGlobalAccel::self()->setShortcut(m_toggleAction, {defaultToggleShortcut});
    m_toggleShortcut = KGlobalAccel::self()->shortcut(m_toggleAction);
    connect(m_toggleAction, &QAction::triggered, this, &BreezyDesktopEffect::toggle);

    connect(KGlobalAccel::self(), &KGlobalAccel::globalShortcutChanged, this, [this](QAction *action, const QKeySequence &seq) {
        if (action->objectName() == QStringLiteral("BreezyDesktop")) {
            m_toggleShortcut.clear();
            m_toggleShortcut.append(seq);
        }
    });

    connect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    updateCursorImage();

    setSource(QUrl::fromLocalFile(QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/effects/breezy_desktop/qml/main.qml"))));

    // Monitor the IMU file for changes
    const QString shmPath = QStringLiteral("/dev/shm/breezy_desktop_imu");
    m_xrRotationFileWatcher = new QFileSystemWatcher(this);
    m_xrRotationFileWatcher->addPath(shmPath);
    connect(m_xrRotationFileWatcher, &QFileSystemWatcher::fileChanged, this, &BreezyDesktopEffect::updateXrRotation);

    m_cursorUpdateTimer = new QTimer(this);
    connect(m_cursorUpdateTimer, &QTimer::timeout, this, &BreezyDesktopEffect::updateCursorPos);
    m_cursorUpdateTimer->setInterval(16); // ~60Hz
    m_cursorUpdateTimer->start();
}

QVariantMap BreezyDesktopEffect::initialProperties(Output *screen)
{
    return QVariantMap{
        {QStringLiteral("effect"), QVariant::fromValue(this)},
        {QStringLiteral("targetScreen"), QVariant::fromValue(screen)}
    };
}

int BreezyDesktopEffect::requestedEffectChainPosition() const
{
    return 70;
}

void BreezyDesktopEffect::toggle()
{
    if (isRunning()) {
        deactivate();
    } else {
        qCCritical(KWIN_XR) << "\t\t\tBreezy - activate";
        activate();
    }
}

void BreezyDesktopEffect::activate()
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

    hideCursor();
}

void BreezyDesktopEffect::deactivate()
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
    disconnect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    m_cursorUpdateTimer->stop();
    showCursor();
}

void BreezyDesktopEffect::realDeactivate()
{
    setRunning(false);
}

int BreezyDesktopEffect::animationDuration() const
{
    return 200;
}

qreal BreezyDesktopEffect::faceDisplacement() const
{
    return 100;
}

qreal BreezyDesktopEffect::distanceFactor() const
{
    return 1.5;
}

bool BreezyDesktopEffect::mouseInvertedX() const
{
    return false;
}

bool BreezyDesktopEffect::mouseInvertedY() const
{
    return false;
}

BreezyDesktopEffect::BackgroundMode BreezyDesktopEffect::backgroundMode() const
{
    return BackgroundMode::Color;
}

QColor BreezyDesktopEffect::backgroundColor() const
{
    return QColor(Qt::black);
}

QQuaternion BreezyDesktopEffect::xrRotation() const {
    return m_xrRotation;
}

void BreezyDesktopEffect::updateXrRotation() {
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
        if (isRunning()) {
            qCCritical(KWIN_XR) << "\t\t\tBreezy - deactivate due to disabled";
            deactivate();
        }

        return;
    }
    
    // Check for reset state (identity quaternion)
    const bool imuResetState = (imuData[0] == 0.0f && imuData[1] == 0.0f && 
                               imuData[2] == 0.0f && imuData[3] == 1.0f);
    
    if (imuResetState) {
        if (isRunning()) {
            qCCritical(KWIN_XR) << "\t\t\tBreezy - deactivate due to reset state";
            deactivate();
        }

        return;
    }
    
    // Create quaternion (w, x, y, z)
    QQuaternion quat(imuData[3], imuData[0], imuData[1], imuData[2]);
    
    if (quat != m_xrRotation) {
        m_xrRotation = quat;
        
        if (!isRunning()) {
            qCCritical(KWIN_XR) << "\t\t\tBreezy - activate";
            activate();
        }

        Q_EMIT xrRotationChanged();
    }
}

QString BreezyDesktopEffect::cursorImageSource() const
{
    return m_cursorImageSource;
}

QPointF BreezyDesktopEffect::cursorPos() const
{
    return m_cursorPos;
}

void BreezyDesktopEffect::showCursor()
{
    if (m_isMouseHidden) {
        effects->showCursor();
        m_isMouseHidden = false;
    }
}

void BreezyDesktopEffect::hideCursor()
{
    if (!m_isMouseHidden) {
        updateCursorImage();
        effects->hideCursor();
        m_isMouseHidden = true;
    }
}

void BreezyDesktopEffect::updateCursorImage()
{
    const auto cursor = effects->cursorImage();
    if (!cursor.image().isNull()) {
        QByteArray data;
        QBuffer buffer(&data);
        buffer.open(QIODevice::WriteOnly);
        cursor.image().save(&buffer, "PNG");

        m_cursorImageSource = QStringLiteral("data:image/png;base64,%1").arg(QString::fromLatin1(data.toBase64()));
    } else {
        m_cursorImageSource = QString();
    }
    Q_EMIT cursorImageChanged();
}

void BreezyDesktopEffect::updateCursorPos()
{
    // Update cursor position from effects
    QPointF newPos = effects->cursorPos();
    if (m_cursorPos != newPos) {
        m_cursorPos = newPos;
        Q_EMIT cursorPosChanged();
    }
}
}

#include "moc_breezydesktopeffect.cpp"