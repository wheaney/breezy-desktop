#include "breezydesktopeffect.h"
#include "cubeconfig.h"
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

namespace DataView
{
    // Helper constants and functions for shared memory buffer offsets
    constexpr int UINT8_SIZE = sizeof(uint8_t);
    constexpr int BOOL_SIZE = UINT8_SIZE;
    constexpr int UINT_SIZE = sizeof(uint32_t);
    constexpr int FLOAT_SIZE = sizeof(float);

    // DataView info: [offset, size, count]
    constexpr int OFFSET_INDEX = 0;
    constexpr int SIZE_INDEX = 1;
    constexpr int COUNT_INDEX = 2;

    // Computes the end offset, exclusive
    constexpr int dataViewEnd(const int info[3]) {
        return info[OFFSET_INDEX] + info[SIZE_INDEX] * info[COUNT_INDEX];
    }

    constexpr int VERSION[3] = {0, UINT8_SIZE, 1};
    constexpr int ENABLED[3] = {dataViewEnd(VERSION), BOOL_SIZE, 1};
    constexpr int LOOK_AHEAD_CFG[3] = {dataViewEnd(ENABLED), FLOAT_SIZE, 4};
    constexpr int DISPLAY_RES[3] = {dataViewEnd(LOOK_AHEAD_CFG), UINT_SIZE, 2};
    constexpr int DISPLAY_FOV[3] = {dataViewEnd(DISPLAY_RES), FLOAT_SIZE, 1};
    constexpr int LENS_DISTANCE_RATIO[3] = {dataViewEnd(DISPLAY_FOV), FLOAT_SIZE, 1};
    constexpr int SBS_ENABLED[3] = {dataViewEnd(LENS_DISTANCE_RATIO), BOOL_SIZE, 1};
    constexpr int CUSTOM_BANNER_ENABLED[3] = {dataViewEnd(SBS_ENABLED), BOOL_SIZE, 1};
    constexpr int SMOOTH_FOLLOW_ENABLED[3] = {dataViewEnd(CUSTOM_BANNER_ENABLED), BOOL_SIZE, 1};
    constexpr int SMOOTH_FOLLOW_ORIGIN_DATA[3] = {dataViewEnd(SMOOTH_FOLLOW_ENABLED), FLOAT_SIZE, 16};
    constexpr int IMU_DATE_MS[3] = {dataViewEnd(SMOOTH_FOLLOW_ORIGIN_DATA), UINT_SIZE, 2};
    constexpr int IMU_QUAT_ENTRIES = 4;
    constexpr int IMU_QUAT_DATA[3] = {dataViewEnd(IMU_DATE_MS), FLOAT_SIZE, 4 * IMU_QUAT_ENTRIES};
    constexpr int IMU_PARITY_BYTE[3] = {dataViewEnd(IMU_QUAT_DATA), UINT8_SIZE, 1};
    constexpr int LENGTH = dataViewEnd(IMU_PARITY_BYTE);
}

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
    reconfigure(ReconfigureAll);

    setSource(QUrl::fromLocalFile(QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/effects/breezy_desktop/qml/main.qml"))));

    // Monitor the IMU file for changes, even if it doesn't exist at startup
    const QString shmPath = QStringLiteral("/dev/shm/breezy_desktop_imu");
    const QString shmDir = QStringLiteral("/dev/shm");
    m_imuRotationFileWatcher = new QFileSystemWatcher(this);
    if (QFile::exists(shmPath)) {
        m_imuRotationFileWatcher->addPath(shmPath);
    } else {
        m_imuRotationFileWatcher->addPath(shmDir);
        connect(m_imuRotationFileWatcher, &QFileSystemWatcher::directoryChanged, this, [this, shmPath](const QString &) {
            if (QFile::exists(shmPath) && !m_imuRotationFileWatcher->files().contains(shmPath)) {
                m_imuRotationFileWatcher->addPath(shmPath);
            }
        });
    }
    connect(m_imuRotationFileWatcher, &QFileSystemWatcher::fileChanged, this, &BreezyDesktopEffect::updateImuRotation);

    m_cursorUpdateTimer = new QTimer(this);
    connect(m_cursorUpdateTimer, &QTimer::timeout, this, &BreezyDesktopEffect::updateCursorPos);
    m_cursorUpdateTimer->setInterval(16); // ~60Hz
    m_cursorUpdateTimer->start();
}

void BreezyDesktopEffect::reconfigure(ReconfigureFlags)
{
    CubeConfig::self()->read();
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

    disconnect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    m_cursorUpdateTimer->stop();
    showCursor();
    
    const QList<Output *> screens = effects->screens();
    for (Output *screen : screens) {
        if (QuickSceneView *view = viewForScreen(screen)) {
            QMetaObject::invokeMethod(view->rootItem(), "stop");
        }
    }

    m_shutdownTimer->start(animationDuration());
}

void BreezyDesktopEffect::realDeactivate()
{
    setRunning(false);
}

int BreezyDesktopEffect::animationDuration() const
{
    return 200;
}

qreal BreezyDesktopEffect::faceDisplacement() const {
    return 100;
}

qreal BreezyDesktopEffect::distanceFactor() const {
    return 1.5;
}

BreezyDesktopEffect::BackgroundMode BreezyDesktopEffect::backgroundMode() const {
    return BackgroundMode::Color;
}

QColor BreezyDesktopEffect::backgroundColor() const {
    return QColor(Qt::black);
}

QList<QQuaternion> BreezyDesktopEffect::imuRotations() const {
    return m_imuRotations;
}

quint32 BreezyDesktopEffect::imuTimeElapsedMs() const {
    return m_imuTimeElapsedMs;
}

quint64 BreezyDesktopEffect::imuTimestamp() const {
    return m_imuTimestamp;
}

QList<qreal> BreezyDesktopEffect::lookAheadConfig() const {
    return m_lookAheadConfig;
}

QList<quint32> BreezyDesktopEffect::displayResolution() const {
    return m_displayResolution;
}

qreal BreezyDesktopEffect::diagonalFOV() const {
    return m_diagonalFOV;
}

qreal BreezyDesktopEffect::lensDistanceRatio() const {
    return m_lensDistanceRatio;
}

bool BreezyDesktopEffect::sbsEnabled() const {
    return m_sbsEnabled;
}

bool BreezyDesktopEffect::customBannerEnabled() const {
    return m_customBannerEnabled;
}

// TODO - can this be something callable from the camera qml code, so it's pulled only when needed?
static qint64 lastConfigUpdate = 0;
void BreezyDesktopEffect::updateImuRotation() {
    const QString shmPath = QStringLiteral("/dev/shm/breezy_desktop_imu");
    QFile shmFile(shmPath);
    if (!shmFile.open(QIODevice::ReadOnly)) {
        return;
    }
    QByteArray buffer = shmFile.readAll();
    shmFile.close();
    if (buffer.size() < 64) {
        return;
    }
    const char* data = buffer.constData();
    uint8_t version = static_cast<uint8_t>(data[0]);
    uint8_t enabledFlag = static_cast<uint8_t>(data[1]);
    uint64_t imuDateMs;
    memcpy(&imuDateMs, data + DataView::IMU_DATE_MS[DataView::OFFSET_INDEX], sizeof(imuDateMs));
    imuDateMs = qFromLittleEndian(imuDateMs);

    const qint64 currentTimeMs = QDateTime::currentMSecsSinceEpoch();
    const bool updateConfig = lastConfigUpdate == 0 || currentTimeMs - lastConfigUpdate > 1000;

    if (updateConfig) {
        float lookAheadConfig[4];
        memcpy(&lookAheadConfig[0], data + DataView::LOOK_AHEAD_CFG[DataView::OFFSET_INDEX], sizeof(lookAheadConfig));
        m_lookAheadConfig.clear();
        m_lookAheadConfig.append(lookAheadConfig[0]);
        m_lookAheadConfig.append(lookAheadConfig[1]);
        m_lookAheadConfig.append(lookAheadConfig[2]);
        m_lookAheadConfig.append(lookAheadConfig[3]);

        uint32_t displayResolution[2];
        memcpy(&displayResolution[0], data + DataView::DISPLAY_RES[DataView::OFFSET_INDEX], sizeof(displayResolution));
        m_displayResolution.clear();
        m_displayResolution.append(displayResolution[0]);
        m_displayResolution.append(displayResolution[1]);

        float displayFov = 0.0f;
        memcpy(&displayFov, data + DataView::DISPLAY_FOV[DataView::OFFSET_INDEX], sizeof(displayFov));
        m_diagonalFOV = displayFov;

        float lensDistanceRatio = 0.0f;
        memcpy(&lensDistanceRatio, data + DataView::LENS_DISTANCE_RATIO[DataView::OFFSET_INDEX], sizeof(lensDistanceRatio));
        m_lensDistanceRatio = lensDistanceRatio;

        uint8_t sbsEnabled = false;
        memcpy(&sbsEnabled, data + DataView::SBS_ENABLED[DataView::OFFSET_INDEX], sizeof(sbsEnabled));
        m_sbsEnabled = (sbsEnabled != 0);

        uint8_t customBannerEnabled = false;
        memcpy(&customBannerEnabled, data + DataView::CUSTOM_BANNER_ENABLED[DataView::OFFSET_INDEX], sizeof(customBannerEnabled));
        m_customBannerEnabled = (customBannerEnabled != 0);
        
        lastConfigUpdate = currentTimeMs;
    }

    const bool validKeepAlive = (currentTimeMs - imuDateMs) < 5000;
    const bool validData = validKeepAlive && m_diagonalFOV != 0.0f;
    const uint8_t expectedVersion = 4;
    const bool enabled = (enabledFlag != 0) && (version == expectedVersion) && validData;
    if (!enabled) {
        if (isRunning()) {
            qCCritical(KWIN_XR) << "\t\t\tBreezy - deactivate due to disabled";
            deactivate();
        }
        return;
    }
    if (updateConfig) Q_EMIT devicePropertiesChanged();

    float imuData[4 * DataView::IMU_QUAT_ENTRIES]; // 4 quaternion-sized rows
    memcpy(imuData, data + DataView::IMU_QUAT_DATA[DataView::OFFSET_INDEX], sizeof(imuData));
    const bool imuResetState = (imuData[0] == 0.0f && imuData[1] == 0.0f && imuData[2] == 0.0f && imuData[3] == 1.0f);
    if (imuResetState) {
        if (isRunning()) {
            qCCritical(KWIN_XR) << "\t\t\tBreezy - deactivate due to reset state";
            deactivate();
        }
        return;
    }

    // convert NWU to EUS by passing root.rotation values: -y, z, -x
    QQuaternion quatT0(imuData[3], -imuData[1], imuData[2], -imuData[0]);

    int imuDataOffset = DataView::IMU_QUAT_ENTRIES;
    QQuaternion quatT1(imuData[imuDataOffset + 3], -imuData[imuDataOffset + 1], imuData[imuDataOffset + 2], -imuData[imuDataOffset + 0]);

    imuDataOffset += DataView::IMU_QUAT_ENTRIES;
    // skip the 3rd quaternion

    // set imuRotations to the last two rotations, leave out the elapsed time
    m_imuRotations.clear();
    m_imuRotations.append(quatT0);
    m_imuRotations.append(quatT1);

    // 4th row isn't actually a quaternion, it contains the timestamps for each of the 3 quaternions
    // elapsed time between T0 and T1 is: imuData[0] - imuData[1]
    imuDataOffset += DataView::IMU_QUAT_ENTRIES;
    m_imuTimeElapsedMs = static_cast<quint32>(imuData[imuDataOffset + 0] - imuData[imuDataOffset + 1]);

    m_imuTimestamp = imuDateMs;
    if (!isRunning()) {
        qCCritical(KWIN_XR) << "\t\t\tBreezy - activate";
        activate();
    }
    Q_EMIT imuRotationsChanged();
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
    effects->showCursor();
}

void BreezyDesktopEffect::hideCursor()
{
    updateCursorImage();
    effects->hideCursor();
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