#include "breezydesktopeffect.h"
#include "breezydesktopconfig.h"
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
    const QString SHM_DIR = QStringLiteral("/dev/shm");
    const QString SHM_PATH = SHM_DIR + QStringLiteral("/breezy_desktop_imu");

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
    qmlRegisterUncreatableType<BreezyDesktopEffect>("org.kde.kwin.effect.breezy_desktop_effect", 1, 0, "BreezyDesktopEffect", QStringLiteral("BreezyDesktop cannot be created in QML"));

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

    setSource(QUrl::fromLocalFile(QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/effects/breezy_desktop_effect/qml/main.qml"))));

    // Monitor the IMU file for changes, even if it doesn't exist at startup
    m_shmDirectoryWatcher = new QFileSystemWatcher(this);
    m_shmDirectoryWatcher->addPath(DataView::SHM_DIR);

    m_shmFileWatcher = new QFileSystemWatcher(this);

    // Setup file watcher with recreation detection
    auto setupFileWatcher = [this]() {
        if (QFile::exists(DataView::SHM_PATH) && (
            m_imuTimestamp == 0 || 
            QDateTime::currentMSecsSinceEpoch() - m_imuTimestamp > 50 || // file may have been deleted and recreated
            !m_shmFileWatcher->files().contains(DataView::SHM_PATH)
        )) {
            m_shmFileWatcher->removePath(DataView::SHM_PATH);
            disconnect(m_shmFileWatcher, &QFileSystemWatcher::fileChanged, this, &BreezyDesktopEffect::updateImuRotation);
            m_shmFileWatcher->addPath(DataView::SHM_PATH);
            connect(m_shmFileWatcher, &QFileSystemWatcher::fileChanged, this, &BreezyDesktopEffect::updateImuRotation);
        }
    };

    // Handle directory changes (file creation/recreation)
    connect(m_shmDirectoryWatcher, &QFileSystemWatcher::directoryChanged, this, setupFileWatcher);

    // Initial setup
    setupFileWatcher();

    m_cursorUpdateTimer = new QTimer(this);
    connect(m_cursorUpdateTimer, &QTimer::timeout, this, &BreezyDesktopEffect::updateCursorPos);
    m_cursorUpdateTimer->setInterval(16); // ~60Hz
    m_cursorUpdateTimer->start();
}

void BreezyDesktopEffect::reconfigure(ReconfigureFlags)
{
    BreezyDesktopConfig::self()->read();
    setFocusedDisplayDistance(BreezyDesktopConfig::focusedDisplayDistance());
    setAllDisplaysDistance(BreezyDesktopConfig::allDisplaysDistance());
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
    // TODO update this to use a persistent on/off value
}

void BreezyDesktopEffect::activate()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - activate";

    if (!isRunning()) setRunning(true);

    connect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    m_cursorUpdateTimer->start();

    // QuickSceneEffect grabs the keyboard and mouse input, which pulls focus away from the active window
    // and doesn't allow for interaction with anything on the desktop. These two calls fix that.
    // TODO - move away from QuickSceneEffect
    effects->ungrabKeyboard();
    effects->stopMouseInterception(this);

    hideCursor();
}

void BreezyDesktopEffect::deactivate()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - deactivate";
    disconnect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    m_cursorUpdateTimer->stop();
    showCursor();
    realDeactivate();
}

void BreezyDesktopEffect::realDeactivate()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - realDeactivate";
    setRunning(false);
}

bool BreezyDesktopEffect::isEnabled() const {
    return m_enabled;
}

bool BreezyDesktopEffect::imuResetState() const {
    return m_imuResetState;
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

qreal BreezyDesktopEffect::focusedDisplayDistance() const {
    return m_focusedDisplayDistance;
}

void BreezyDesktopEffect::setFocusedDisplayDistance(qreal distance) {
    if (distance != m_focusedDisplayDistance) {
        m_focusedDisplayDistance = std::clamp(distance, 0.2, 2.5);
        Q_EMIT displayDistanceChanged();
    }
}

qreal BreezyDesktopEffect::allDisplaysDistance() const {
    return m_allDisplaysDistance;
}

void BreezyDesktopEffect::setAllDisplaysDistance(qreal distance) {
    if (distance != m_allDisplaysDistance) {
        m_allDisplaysDistance = std::clamp(distance, 0.2, 2.5);
        Q_EMIT displayDistanceChanged();
    }
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

bool BreezyDesktopEffect::checkParityByte(const char* data) {
    const uint8_t parityByte = static_cast<uint8_t>(data[DataView::IMU_PARITY_BYTE[DataView::OFFSET_INDEX]]);
    uint8_t parity = 0;

    const int dateBytes = DataView::IMU_DATE_MS[DataView::COUNT_INDEX] * DataView::IMU_DATE_MS[DataView::SIZE_INDEX];
    for (int i = 0; i < dateBytes; ++i) {
        parity ^= static_cast<uint8_t>(data[DataView::IMU_DATE_MS[DataView::OFFSET_INDEX] + i]);
    }

    const int quatBytes = DataView::IMU_QUAT_DATA[DataView::COUNT_INDEX] * DataView::IMU_QUAT_DATA[DataView::SIZE_INDEX];
    for (int i = 0; i < quatBytes; ++i) {
        parity ^= static_cast<uint8_t>(data[DataView::IMU_QUAT_DATA[DataView::OFFSET_INDEX] + i]);
    }

    return parityByte == parity;
}

// TODO - can this be something callable from the camera qml code, so it's pulled only when needed?
static qint64 lastConfigUpdate = 0;
static qint64 activatedAt = 0;
void BreezyDesktopEffect::updateImuRotation() {    
    const QString shmPath = QStringLiteral("/dev/shm/breezy_desktop_imu");
    QFile shmFile(shmPath);
    if (!shmFile.open(QIODevice::ReadOnly)) {
        return;
    }
    QByteArray buffer = shmFile.readAll();
    shmFile.close();
    if (buffer.size() != DataView::LENGTH) return;

    const char* data = buffer.constData();
    if (!checkParityByte(data)) return;

    uint8_t version = static_cast<uint8_t>(data[DataView::VERSION[DataView::OFFSET_INDEX]]);
    uint8_t enabledFlag = static_cast<uint8_t>(data[DataView::ENABLED[DataView::OFFSET_INDEX]]);
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
    bool enabledFlagSet = (enabledFlag != 0);
    bool validVersion = (version == expectedVersion);
    const bool wasEnabled = m_enabled;
    const bool enabled = enabledFlagSet && validVersion && validData;
    if (!enabled) {
        // give a grace period after enabling the effect
        if (wasEnabled && (currentTimeMs - activatedAt > 1000)) {
            qCCritical(KWIN_XR) << "\t\t\tBreezy - disabling effect; currentTimeMs:" << currentTimeMs
                                << "imuDateMs:" << imuDateMs
                                << "enabledFlag:" << enabledFlag
                                << "version:" << version
                                << "diagonalFOV:" << m_diagonalFOV;
            deactivate();
            m_enabled = false;
            Q_EMIT enabledStateChanged();
            return;
        }
    } else if (!wasEnabled) {
        qCCritical(KWIN_XR) << "\t\t\tBreezy - enabling effect; currentTimeMs:" << currentTimeMs
                                << "imuDateMs:" << imuDateMs
                                << "enabledFlag:" << enabledFlag
                                << "version:" << version
                                << "diagonalFOV:" << m_diagonalFOV;
        activate();
        m_enabled = true;
        Q_EMIT enabledStateChanged();
        activatedAt = currentTimeMs;
    }
    
    if (updateConfig) Q_EMIT devicePropertiesChanged();

    float imuData[4 * DataView::IMU_QUAT_ENTRIES]; // 4 quaternion-sized rows
    memcpy(imuData, data + DataView::IMU_QUAT_DATA[DataView::OFFSET_INDEX], sizeof(imuData));
    m_imuResetState = (imuData[0] == 0.0f && imuData[1] == 0.0f && imuData[2] == 0.0f && imuData[3] == 1.0f);

    // convert NWU to EUS by passing root.rotation values: -y, z, -x
    QQuaternion quatT0(imuData[3], -imuData[1], imuData[2], -imuData[0]);

    int imuDataOffset = DataView::IMU_QUAT_ENTRIES;
    QQuaternion quatT1(imuData[imuDataOffset + 3], -imuData[imuDataOffset + 1], imuData[imuDataOffset + 2], -imuData[imuDataOffset + 0]);

    imuDataOffset += DataView::IMU_QUAT_ENTRIES;

    // skip the 3rd quaternion
    imuDataOffset += DataView::IMU_QUAT_ENTRIES;

    // set imuRotations to the last two rotations, leave out the elapsed time
    m_imuRotations.clear();
    m_imuRotations.append(quatT0);
    m_imuRotations.append(quatT1);

    // 4th row isn't actually a quaternion, it contains the timestamps for each of the 3 quaternions
    // elapsed time between T0 and T1 is: imuData[0] - imuData[1]
    m_imuTimeElapsedMs = static_cast<quint32>(imuData[imuDataOffset + 0] - imuData[imuDataOffset + 1]);

    m_imuTimestamp = imuDateMs;
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