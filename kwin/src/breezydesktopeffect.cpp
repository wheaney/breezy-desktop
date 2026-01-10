#include "core/output.h"
#include "core/rendertarget.h"
#include "core/renderviewport.h"
#include "cursor.h"
#include "pointer_input.h"
#include "kcm/shortcuts.h"
#include "breezydesktopeffect.h"
#include "breezydesktopconfig.h"
#include "effect/effect.h"
#include "effect/effecthandler.h"
#include "opengl/glutils.h"
#include "xrdriveripc.h"

#include <kwin/main.h>
#include <core/outputbackend.h>

#include <functional>
#include <QAction>
#include <QBuffer>
#include <QFile>
#include <QFileSystemWatcher>
#include <QLoggingCategory>
#include <QQuickItem>
#include <QTimer>
#include <QDBusConnection>
#include <QDateTime>

#include <KGlobalAccel>
#include <KLocalizedString>

#include <algorithm>

Q_LOGGING_CATEGORY(KWIN_XR, "kwin.xr")

// A small DBus adaptor to expose effect controls to the KCM.
// Service is provided by KWin (org.kde.KWin). We only register an object path.
// Interface: com.xronlinux.BreezyDesktop, Path: /com/xronlinux/BreezyDesktop
namespace {
class BreezyDesktopDBusAdaptor : public QObject {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "com.xronlinux.BreezyDesktop")
public:
    explicit BreezyDesktopDBusAdaptor(KWin::BreezyDesktopEffect *effect)
        : QObject(effect), m_effect(effect) {}

public Q_SLOTS:
    QVariantList AddVirtualDisplay(int width, int height) {
        m_effect->addVirtualDisplay(QSize(width, height));
        return m_effect->listVirtualDisplays();
    }

    QVariantList ListVirtualDisplays() const {
        return m_effect->listVirtualDisplays();
    }

    QVariantList RemoveVirtualDisplay(const QString &id) {
        m_effect->removeVirtualDisplay(id);
        return m_effect->listVirtualDisplays();
    }

    bool CurvedDisplaySupported() {
        return m_effect->curvedDisplaySupported();
    }

    private:
        KWin::BreezyDesktopEffect *m_effect;
    };
} // namespace

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
    constexpr int POSE_POSITION_DATA[3] = {dataViewEnd(SMOOTH_FOLLOW_ORIGIN_DATA), FLOAT_SIZE, 3};
    constexpr int POSE_DATE_MS[3] = {dataViewEnd(POSE_POSITION_DATA), UINT_SIZE, 2};
    constexpr int POSE_ORIENTATION_ENTRIES = 4;
    constexpr int POSE_ORIENTATION_DATA[3] = {dataViewEnd(POSE_DATE_MS), FLOAT_SIZE, 4 * POSE_ORIENTATION_ENTRIES};
    constexpr int POSE_PARITY_BYTE[3] = {dataViewEnd(POSE_ORIENTATION_DATA), UINT8_SIZE, 1};
    constexpr int LENGTH = dataViewEnd(POSE_PARITY_BYTE);
}

namespace KWin
{

BreezyDesktopEffect::BreezyDesktopEffect()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - constructor";
    qmlRegisterUncreatableType<BreezyDesktopEffect>("org.kde.kwin.effect.breezy_desktop", 1, 0, "BreezyDesktopEffect", QStringLiteral("BreezyDesktop cannot be created in QML"));

    setupGlobalShortcut(
        BreezyShortcuts::TOGGLE,
        [this]() { this->toggle(); }
    );
    setupGlobalShortcut(
        BreezyShortcuts::RECENTER,
        [this]() { this->recenter(); }
    );
    setupGlobalShortcut(
        BreezyShortcuts::TOGGLE_ZOOM_ON_FOCUS,
        [this]() { 
            this->setZoomOnFocusEnabled(!m_zoomOnFocusEnabled);
        }
    );
    setupGlobalShortcut(
        BreezyShortcuts::TOGGLE_FOLLOW_MODE,
        [this]() { this->toggleSmoothFollow(); }
    );
    setupGlobalShortcut(
        BreezyShortcuts::CURSOR_TO_FOCUSED_DISPLAY,
        [this]() { this->moveCursorToFocusedDisplay(); }
    );

    connect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    updateCursorImage();
    reconfigure(ReconfigureAll);

    setSource(QUrl::fromLocalFile(QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("kwin/effects/breezy_desktop/qml/main.qml"))));

    // Monitor the IPC file for changes, even if it doesn't exist at startup
    m_shmDirectoryWatcher = new QFileSystemWatcher(this);
    m_shmDirectoryWatcher->addPath(DataView::SHM_DIR);

    m_shmFileWatcher = new QFileSystemWatcher(this);

    // Setup file watcher with recreation detection
    auto setupFileWatcher = [this]() {
        if (QFile::exists(DataView::SHM_PATH) && (
            m_poseTimestamp == 0 || 
            QDateTime::currentMSecsSinceEpoch() - m_poseTimestamp > 50 || // file may have been deleted and recreated
            !m_shmFileWatcher->files().contains(DataView::SHM_PATH)
        )) {
            m_shmFileWatcher->removePath(DataView::SHM_PATH);
            disconnect(m_shmFileWatcher, &QFileSystemWatcher::fileChanged, this, &BreezyDesktopEffect::updatePoseOrientation);
            m_shmFileWatcher->addPath(DataView::SHM_PATH);
            connect(m_shmFileWatcher, &QFileSystemWatcher::fileChanged, this, &BreezyDesktopEffect::updatePoseOrientation);
        }
    };

    // Handle directory changes (file creation/recreation)
    connect(m_shmDirectoryWatcher, &QFileSystemWatcher::directoryChanged, this, setupFileWatcher);

    // Initial setup
    setupFileWatcher();

    m_watchdogTimer = new QTimer(this);
    m_watchdogTimer->setInterval(1000);
    connect(m_watchdogTimer, &QTimer::timeout, this, [this]() {
        if (!m_enabled) return;
        this->updatePoseOrientation();
    });
    m_watchdogTimer->start();

    m_cursorUpdateTimer = new QTimer(this);
    connect(m_cursorUpdateTimer, &QTimer::timeout, this, &BreezyDesktopEffect::updateCursorPos);
    m_cursorUpdateTimer->setInterval(16); // ~60Hz
    m_cursorUpdateTimer->start();

    // Register DBus object under KWin's session bus name
    auto *adaptor = new BreezyDesktopDBusAdaptor(this);
    const bool dbusOk = QDBusConnection::sessionBus().registerObject(
        QStringLiteral("/com/xronlinux/BreezyDesktop"),
        adaptor,
        QDBusConnection::ExportAllSlots);
    if (!dbusOk) {
        qCWarning(KWIN_XR) << "Failed to register DBus object /com/xronlinux/BreezyDesktop";
    }
}

BreezyDesktopEffect::~BreezyDesktopEffect()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - destructor";
    if (m_shmFileWatcher) {
        if (!DataView::SHM_PATH.isEmpty()) {
            m_shmFileWatcher->removePath(DataView::SHM_PATH);
        }
        m_shmFileWatcher->deleteLater();
        m_shmFileWatcher = nullptr;
    }
    if (m_shmDirectoryWatcher) {
        m_shmDirectoryWatcher->deleteLater();
        m_shmDirectoryWatcher = nullptr;
    }
    if (m_watchdogTimer) {
        m_watchdogTimer->stop();
        m_watchdogTimer->deleteLater();
        m_watchdogTimer = nullptr;
    }
    deactivate();
}

void BreezyDesktopEffect::setupGlobalShortcut(const BreezyShortcuts::Shortcut &shortcut, std::function<void()> triggeredFunc) {
    QAction *action = new QAction(this);
    action->setObjectName(shortcut.actionName);
    action->setText(shortcut.actionText);
    KGlobalAccel::self()->setDefaultShortcut(action, {shortcut.shortcut});
    KGlobalAccel::self()->setShortcut(action, {shortcut.shortcut});
    connect(action, &QAction::triggered, this, triggeredFunc);
}

void BreezyDesktopEffect::recenter() {
    QJsonObject flags; 
    flags.insert(QStringLiteral("recenter_screen"), true);
    XRDriverIPC::instance().writeControlFlags(flags);
}

void BreezyDesktopEffect::setLookingAtScreenIndex(int index)
{
    m_lookingAtScreenIndex = index;
    if (m_smoothFollowEnabled) updateDriverSmoothFollowSettings();
}

void BreezyDesktopEffect::reconfigure(ReconfigureFlags)
{
    BreezyDesktopConfig::self()->read();
    setLookAheadOverride(BreezyDesktopConfig::lookAheadOverride());
    setFocusedDisplayDistance(BreezyDesktopConfig::focusedDisplayDistance() / 100.0f);
    setAllDisplaysDistance(BreezyDesktopConfig::allDisplaysDistance() / 100.0f);
    setDisplaySpacing(BreezyDesktopConfig::displaySpacing() / 1000.0f);
    setDisplaySize(BreezyDesktopConfig::displaySize() / 100.0f);
    setZoomOnFocusEnabled(BreezyDesktopConfig::zoomOnFocusEnabled());
    setSmoothFollowThreshold(BreezyDesktopConfig::smoothFollowThreshold());

    qreal horiz = BreezyDesktopConfig::displayHorizontalOffset() / 100.0f;
    qreal vert = BreezyDesktopConfig::displayVerticalOffset() / 100.0f;
    bool offsetchanged = false;
    if (!qFuzzyCompare(m_displayHorizontalOffset, horiz)) { m_displayHorizontalOffset = horiz; offsetchanged = true; }
    if (!qFuzzyCompare(m_displayVerticalOffset, vert)) { m_displayVerticalOffset = vert; offsetchanged = true; }
    if (offsetchanged) Q_EMIT displayOffsetChanged();

    int wrap = BreezyDesktopConfig::displayWrappingScheme();
    int aaQuality = BreezyDesktopConfig::antialiasingQuality();
    bool removeVD = BreezyDesktopConfig::removeVirtualDisplaysOnDisable();
    bool mirrorPhysicalDisplays = BreezyDesktopConfig::mirrorPhysicalDisplays();
    if (m_displayWrappingScheme != wrap) { m_displayWrappingScheme = wrap; Q_EMIT displayWrappingSchemeChanged(); }
    if (m_antialiasingQuality != aaQuality) { m_antialiasingQuality = aaQuality; Q_EMIT antialiasingQualityChanged(); }
    if (m_removeVirtualDisplaysOnDisable != removeVD) { m_removeVirtualDisplaysOnDisable = removeVD; Q_EMIT removeVirtualDisplaysOnDisableChanged(); }
    if (m_mirrorPhysicalDisplays != mirrorPhysicalDisplays) { m_mirrorPhysicalDisplays = mirrorPhysicalDisplays; Q_EMIT mirrorPhysicalDisplaysChanged(); }

    const bool developerMode = BreezyDesktopConfig::developerMode();
    if (m_developerMode != developerMode) { m_developerMode = developerMode; Q_EMIT developerModeChanged(); }

    bool curved = BreezyDesktopConfig::curvedDisplay() && m_curvedDisplaySupported;
    if (m_curvedDisplay != curved) { m_curvedDisplay = curved; Q_EMIT curvedDisplayChanged(); }

    // this one doesn't have a signal, just always assign it
    m_allDisplaysFollowMode = BreezyDesktopConfig::allDisplaysFollowMode();
}

bool BreezyDesktopEffect::developerMode() const
{
    return m_developerMode;
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
        qCCritical(KWIN_XR) << "\t\t\tBreezy - toggle - disabling";
        disableDriver();
    } else {
        qCCritical(KWIN_XR) << "\t\t\tBreezy - toggle - enabling";
        enableDriver();
    }
}

void BreezyDesktopEffect::activate()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - activate";

    if (!isRunning()) setRunning(true);

    connect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    m_cursorUpdateTimer->start();

    // QuickSceneEffect grabs the keyboard and mouse input, which pulls focus away from the active window
    // and doesn't allow for interaction with anything on the desktop. These two calls fix that.
    effects->ungrabKeyboard();
    effects->stopMouseInterception(this);
}

void BreezyDesktopEffect::deactivate()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - deactivate";

    m_effectTargetScreenIndex = -1;
    invalidateEffectOnScreenGeometryCache();

    disconnect(effects, &EffectsHandler::cursorShapeChanged, this, &BreezyDesktopEffect::updateCursorImage);
    m_cursorUpdateTimer->stop();
    showCursor();

    if (m_removeVirtualDisplaysOnDisable) {
        for (auto it = m_virtualDisplays.begin(); it != m_virtualDisplays.end(); ++it) {
            if (it->output) {
                KWin::kwinApp()->outputBackend()->removeVirtualOutput(it->output);
            }
        }
        m_virtualDisplays.clear();
    }

    setRunning(false);
}

void BreezyDesktopEffect::enableDriver()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - enableDriver";
    QJsonObject newConfig = QJsonObject();
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    if (configJsonOpt) {
        newConfig = configJsonOpt.value();
    }
    newConfig.insert(QStringLiteral("disabled"), false);
    newConfig.insert(QStringLiteral("output_mode"), QStringLiteral("external_only"));
    newConfig.insert(QStringLiteral("external_mode"), QStringLiteral("breezy_desktop"));
    XRDriverIPC::instance().writeConfig(newConfig);
}

void BreezyDesktopEffect::disableDriver()
{
    qCCritical(KWIN_XR) << "\t\t\tBreezy - disableDriver";
    QJsonObject newConfig = QJsonObject();
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    if (configJsonOpt) {
        newConfig = configJsonOpt.value();
    }
    newConfig.insert(QStringLiteral("external_mode"), QStringLiteral("none"));
    XRDriverIPC::instance().writeConfig(newConfig);
}

void BreezyDesktopEffect::addVirtualDisplay(QSize size)
{
    static int virtualDisplayCount = 0;
    ++virtualDisplayCount;
    QString name = QStringLiteral("BreezyDesktop_%1").arg(virtualDisplayCount);
    #if defined(KWIN_VERSION_ENCODED) && KWIN_VERSION_ENCODED >= 60290
        QString description = QStringLiteral("Breezy Display %1x%2 (%3)").arg(size.width()).arg(size.height()).arg(virtualDisplayCount);
        auto output = KWin::kwinApp()->outputBackend()->createVirtualOutput(name, description, size, 1.0);
    #else
        auto output = KWin::kwinApp()->outputBackend()->createVirtualOutput(name, size, 1.0);
    #endif
    if (output) {
        VirtualOutputInfo info;
        info.output = output;
        info.id = name;
        info.size = size;
        m_virtualDisplays.insert(info.id, info);
    }
}

QVariantList BreezyDesktopEffect::listVirtualDisplays() const {
    QVariantList list;
    for (auto it = m_virtualDisplays.constBegin(); it != m_virtualDisplays.constEnd(); ++it) {
        const auto &info = it.value();
        if (!info.output)
            continue;
        QVariantMap entry;
        entry.insert(QStringLiteral("id"), info.id);
        entry.insert(QStringLiteral("width"), info.size.width());
        entry.insert(QStringLiteral("height"), info.size.height());
        list.push_back(entry);
    }
    return list;
}

bool BreezyDesktopEffect::removeVirtualDisplay(const QString &id) {
    auto it = m_virtualDisplays.find(id);
    if (it != m_virtualDisplays.end()) {
        Output *output = it->output;
        if (output) {
            KWin::kwinApp()->outputBackend()->removeVirtualOutput(output);
        }
        m_virtualDisplays.erase(it);
        return true;
    }
    return false;
}

bool BreezyDesktopEffect::isEnabled() const {
    return m_enabled;
}

void BreezyDesktopEffect::setEffectTargetScreenIndex(int index) {
    if (m_effectTargetScreenIndex != index) {
        m_effectTargetScreenIndex = index;
        invalidateEffectOnScreenGeometryCache();
        evaluateCursorOnScreenState(m_cursorPos, m_cursorPos);
    }
}

bool BreezyDesktopEffect::isZoomOnFocusEnabled() const {
    return m_zoomOnFocusEnabled;
}

void BreezyDesktopEffect::setZoomOnFocusEnabled(bool enabled) {
    if (m_zoomOnFocusEnabled != enabled) {
        m_zoomOnFocusEnabled = enabled;
        if (m_zoomOnFocusEnabled && m_focusedDisplayDistance > m_allDisplaysDistance) {
            setFocusedDisplayDistance(m_allDisplaysDistance);
            BreezyDesktopConfig::setFocusedDisplayDistance(static_cast<int>(m_focusedDisplayDistance * 100.0f));
        }
        BreezyDesktopConfig::setZoomOnFocusEnabled(enabled);
        BreezyDesktopConfig::self()->save();
        Q_EMIT zoomOnFocusChanged();
    }
}

void BreezyDesktopEffect::toggleSmoothFollow() {
    QJsonObject flags;
    flags.insert(QStringLiteral("toggle_breezy_desktop_smooth_follow"), true);
    XRDriverIPC::instance().writeControlFlags(flags);
}

bool BreezyDesktopEffect::poseResetState() const {
    return m_poseResetState;
}

QList<QQuaternion> BreezyDesktopEffect::poseOrientations() const {
    return m_poseOrientations;
}

QVector3D BreezyDesktopEffect::posePosition() const {
    return m_posePosition;
}

quint32 BreezyDesktopEffect::poseTimeElapsedMs() const {
    return m_poseTimeElapsedMs;
}

quint64 BreezyDesktopEffect::poseTimestamp() const {
    return m_poseTimestamp;
}

QList<qreal> BreezyDesktopEffect::lookAheadConfig() const {
    return m_lookAheadConfig;
}

qreal BreezyDesktopEffect::lookAheadOverride() const {
    return m_lookAheadOverride;
}

void BreezyDesktopEffect::setLookAheadOverride(qreal override) {
    if (override != m_lookAheadOverride) {
        m_lookAheadOverride = override;
        Q_EMIT lookAheadOverrideChanged();
    }
}

QList<quint32> BreezyDesktopEffect::displayResolution() const {
    return m_displayResolution;
}

qreal BreezyDesktopEffect::focusedDisplayDistance() const {
    return m_focusedDisplayDistance;
}

void BreezyDesktopEffect::setFocusedDisplayDistance(qreal distance) {
    if (distance != m_focusedDisplayDistance) {
        m_focusedDisplayDistance = std::clamp(distance, 0.2, m_allDisplaysDistance);
        Q_EMIT focusedDisplayDistanceChanged();

        if (m_smoothFollowEnabled) updateDriverSmoothFollowSettings();
    }
}

qreal BreezyDesktopEffect::allDisplaysDistance() const {
    return m_allDisplaysDistance;
}

void BreezyDesktopEffect::setAllDisplaysDistance(qreal distance) {
    if (distance != m_allDisplaysDistance) {
        qreal min = m_zoomOnFocusEnabled ? m_focusedDisplayDistance : 0.2;
        m_allDisplaysDistance = std::clamp(distance, min, 2.5);
        Q_EMIT allDisplaysDistanceChanged();
    }
}

qreal BreezyDesktopEffect::displaySpacing() const {
    return m_displaySpacing;
}

void BreezyDesktopEffect::setDisplaySpacing(qreal spacing) {
    if (spacing != m_displaySpacing) {
        m_displaySpacing = spacing;
        Q_EMIT displaySpacingChanged();
    }
}

qreal BreezyDesktopEffect::displaySize() const {
    return m_displaySize;
}

void BreezyDesktopEffect::setDisplaySize(qreal size) {
    const qreal clamped = std::clamp(size, 0.5, 2.0);
    if (!qFuzzyCompare(clamped, m_displaySize)) {
        m_displaySize = clamped;
        Q_EMIT displaySizeChanged();
    }
}

qreal BreezyDesktopEffect::displayHorizontalOffset() const {
    return m_displayHorizontalOffset;
}

qreal BreezyDesktopEffect::displayVerticalOffset() const {
    return m_displayVerticalOffset;
}

int BreezyDesktopEffect::displayWrappingScheme() const {
    return m_displayWrappingScheme;
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

int BreezyDesktopEffect::antialiasingQuality() const {
    return m_antialiasingQuality;
}

bool BreezyDesktopEffect::removeVirtualDisplaysOnDisable() const {
    return m_removeVirtualDisplaysOnDisable;
}

bool BreezyDesktopEffect::mirrorPhysicalDisplays() const {
    return m_mirrorPhysicalDisplays;
}

bool BreezyDesktopEffect::curvedDisplay() const {
    return m_curvedDisplay;
}

bool BreezyDesktopEffect::curvedDisplaySupported() const {
    return m_curvedDisplaySupported;
}

void BreezyDesktopEffect::setCurvedDisplaySupported(bool supported) {
    if (m_curvedDisplaySupported != supported) {
        m_curvedDisplaySupported = supported;
        Q_EMIT curvedDisplaySupportedChanged();
    }

    bool curvedDisplayEnabled = supported && BreezyDesktopConfig::curvedDisplay();
    if (curvedDisplayEnabled != m_curvedDisplay) {
        m_curvedDisplay = curvedDisplayEnabled;
        Q_EMIT curvedDisplayChanged();
    }
}

QList<QQuaternion> BreezyDesktopEffect::smoothFollowOrigin() const {
    return m_smoothFollowOrigin;
}

bool BreezyDesktopEffect::smoothFollowEnabled() const {
    // the effect doesn't need to know about smooth follow if it's in "all displays" mode
    return m_focusedSmoothFollowEnabled;
}

bool BreezyDesktopEffect::checkParityByte(const char* data) {
    const uint8_t parityByte = static_cast<uint8_t>(data[DataView::POSE_PARITY_BYTE[DataView::OFFSET_INDEX]]);
    uint8_t parity = 0;

    const int dateBytes = DataView::POSE_DATE_MS[DataView::COUNT_INDEX] * DataView::POSE_DATE_MS[DataView::SIZE_INDEX];
    for (int i = 0; i < dateBytes; ++i) {
        parity ^= static_cast<uint8_t>(data[DataView::POSE_DATE_MS[DataView::OFFSET_INDEX] + i]);
    }

    const int quatBytes = DataView::POSE_ORIENTATION_DATA[DataView::COUNT_INDEX] * DataView::POSE_ORIENTATION_DATA[DataView::SIZE_INDEX];
    for (int i = 0; i < quatBytes; ++i) {
        parity ^= static_cast<uint8_t>(data[DataView::POSE_ORIENTATION_DATA[DataView::OFFSET_INDEX] + i]);
    }

    return parityByte == parity;
}

static qint64 lastConfigUpdate = 0;
static qint64 activatedAt = 0;
void BreezyDesktopEffect::updatePoseOrientation() {    
    // Reentrancy guard: if an update is already in progress, skip
    bool expected = false;
    if (!m_poseUpdateInProgress.compare_exchange_strong(expected, true)) {
        return;
    }

    // destructor called on function exit, triggers reset of the flag
    struct ResetFlag { std::atomic<bool>* f; ~ResetFlag(){ f->store(false); } } reset{&m_poseUpdateInProgress};

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
    uint64_t poseDateMs;
    memcpy(&poseDateMs, data + DataView::POSE_DATE_MS[DataView::OFFSET_INDEX], sizeof(poseDateMs));
    poseDateMs = qFromLittleEndian(poseDateMs);

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

    const bool validKeepAlive = (currentTimeMs - poseDateMs) < 5000;
    const bool validData = validKeepAlive && m_diagonalFOV != 0.0f;
    const uint8_t expectedVersion = 5;
    bool enabledFlagSet = (enabledFlag != 0);
    bool validVersion = (version == expectedVersion);
    const bool wasEnabled = m_enabled;
    const bool enabled = enabledFlagSet && validVersion && validData;
    if (!enabled) {
        // give a grace period after enabling the effect
        if (wasEnabled && (currentTimeMs - activatedAt > 1000)) {
            qCCritical(KWIN_XR) << "\t\t\tBreezy - disabling effect; currentTimeMs:" << currentTimeMs
                                << "poseDateMs:" << poseDateMs
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
                                << "poseDateMs:" << poseDateMs
                                << "enabledFlag:" << enabledFlag
                                << "version:" << version
                                << "diagonalFOV:" << m_diagonalFOV;
        activate();
        m_enabled = true;
        Q_EMIT enabledStateChanged();
        activatedAt = currentTimeMs;
    }
    
    if (updateConfig) Q_EMIT devicePropertiesChanged();

    float posePositionData[3];
    memcpy(posePositionData, data + DataView::POSE_POSITION_DATA[DataView::OFFSET_INDEX], sizeof(posePositionData));

    // convert NWU to EUS by passing position values: -y, z, -x
    m_posePosition = QVector3D(-posePositionData[1], posePositionData[2], -posePositionData[0]);

    float poseOrientationData[4 * DataView::POSE_ORIENTATION_ENTRIES]; // 4 quaternion-sized rows
    memcpy(poseOrientationData, data + DataView::POSE_ORIENTATION_DATA[DataView::OFFSET_INDEX], sizeof(poseOrientationData));
    bool wasPoseResetState = m_poseResetState;
    m_poseResetState = (poseOrientationData[0] == 0.0f && poseOrientationData[1] == 0.0f && poseOrientationData[2] == 0.0f && poseOrientationData[3] == 1.0f);
    if (m_poseResetState != wasPoseResetState) {
        if (m_poseResetState) recenter();
        Q_EMIT poseResetStateChanged();
    }

    // convert NWU to EUS by passing orientation values: -y, z, -x
    QQuaternion quatT0(poseOrientationData[3], -poseOrientationData[1], poseOrientationData[2], -poseOrientationData[0]);

    int orientationDataOffset = DataView::POSE_ORIENTATION_ENTRIES;
    QQuaternion quatT1(poseOrientationData[orientationDataOffset + 3], -poseOrientationData[orientationDataOffset + 1], poseOrientationData[orientationDataOffset + 2], -poseOrientationData[orientationDataOffset + 0]);

    orientationDataOffset += DataView::POSE_ORIENTATION_ENTRIES;

    // skip the 3rd quaternion
    orientationDataOffset += DataView::POSE_ORIENTATION_ENTRIES;

    // set poseOrientations to the last two rotations, leave out the elapsed time
    m_poseOrientations.clear();
    m_poseOrientations.append(quatT0);
    m_poseOrientations.append(quatT1);

    // 4th row isn't actually a quaternion, it contains the timestamps for each of the 3 quaternions
    // elapsed time between T0 and T1 is: poseOrientationData[0] - poseOrientationData[1]
    m_poseTimeElapsedMs = static_cast<quint32>(poseOrientationData[orientationDataOffset + 0] - poseOrientationData[orientationDataOffset + 1]);

    m_poseTimestamp = poseDateMs;
    
    float originData[4 * DataView::POSE_ORIENTATION_ENTRIES]; // 4 quaternion-sized rows
    memcpy(originData, data + DataView::SMOOTH_FOLLOW_ORIGIN_DATA[DataView::OFFSET_INDEX], sizeof(originData));

    // convert NWU to EUS by passing root.rotation values: -y, z, -x
    QQuaternion sfQuatT0(originData[3], -originData[1], originData[2], -originData[0]);

    int originDataOffset = DataView::POSE_ORIENTATION_ENTRIES;
    QQuaternion sfQuatT1(originData[originDataOffset + 3], -originData[originDataOffset + 1], originData[originDataOffset + 2], -originData[originDataOffset + 0]);

    originDataOffset += DataView::POSE_ORIENTATION_ENTRIES;

    // skip the 3rd quaternion
    originDataOffset += DataView::POSE_ORIENTATION_ENTRIES;

    // set smoothFollowOrigin to the last two rotations, leave out the elapsed time
    m_smoothFollowOrigin.clear();
    m_smoothFollowOrigin.append(sfQuatT0);
    m_smoothFollowOrigin.append(sfQuatT1);

    uint8_t smoothFollowEnabled = false;
    memcpy(&smoothFollowEnabled, data + DataView::SMOOTH_FOLLOW_ENABLED[DataView::OFFSET_INDEX], sizeof(smoothFollowEnabled));
    bool nextSmoothFollowEnabled = (smoothFollowEnabled != 0);
    bool focusedSmoothFollowEnabled = nextSmoothFollowEnabled && !m_allDisplaysFollowMode;
    if (m_smoothFollowEnabled != nextSmoothFollowEnabled || m_focusedSmoothFollowEnabled != focusedSmoothFollowEnabled) {
        m_smoothFollowEnabled = nextSmoothFollowEnabled;

        if (m_focusedSmoothFollowEnabled != focusedSmoothFollowEnabled) {
            m_focusedSmoothFollowEnabled = focusedSmoothFollowEnabled;

            // only emit the signal if it affects the effect
            Q_EMIT smoothFollowEnabledChanged();
        }

        if (m_smoothFollowEnabled) updateDriverSmoothFollowSettings();
    } else if (enabled && !wasEnabled) {
        Q_EMIT smoothFollowEnabledChanged();
        if (m_smoothFollowEnabled) updateDriverSmoothFollowSettings();
    }
}

void BreezyDesktopEffect::setSmoothFollowThreshold(float threshold) {
    if (m_smoothFollowThreshold != threshold) {
        m_smoothFollowThreshold = threshold;
        if (m_smoothFollowEnabled) updateDriverSmoothFollowSettings();
    }
}

void BreezyDesktopEffect::updateDriverSmoothFollowSettings() {
    qreal adjustedDistance = m_focusedDisplayDistance;

    if (m_lookingAtScreenIndex != -1 && !m_displayResolution.isEmpty()) {
        // Adjust display distance by relative monitor size compared to the FOV monitor
        const Output *focusedOutput = effects->screens().at(m_lookingAtScreenIndex);
        const QSize focusedSize = focusedOutput ? focusedOutput->geometry().size() : QSize();

        if (focusedSize.isValid()) {
            const qreal fovW = static_cast<qreal>(m_displayResolution.at(0));
            const qreal fovH = static_cast<qreal>(m_displayResolution.at(1));

            const qreal ratioW = static_cast<qreal>(focusedSize.width()) / fovW;
            const qreal ratioH = static_cast<qreal>(focusedSize.height()) / fovH;
            const qreal focusedMonitorSizeAdjustment = std::max(ratioW, ratioH);

            adjustedDistance = m_focusedDisplayDistance / focusedMonitorSizeAdjustment;
        }
    }

    QJsonObject flags;
    flags.insert(QStringLiteral("breezy_desktop_display_distance"), adjustedDistance);
    flags.insert(QStringLiteral("breezy_desktop_follow_threshold"), m_smoothFollowThreshold);
    XRDriverIPC::instance().writeControlFlags(flags);
}

QString BreezyDesktopEffect::cursorImageSource() const
{
    return m_cursorImageSource;
}

QSize BreezyDesktopEffect::cursorImageSize() const
{
    return m_cursorImageSize;
}

QPointF BreezyDesktopEffect::cursorPos() const
{
    return m_cursorPos;
}

void BreezyDesktopEffect::showCursor()
{
    if (!m_cursorHidden) return;

    effects->showCursor();
    m_cursorHidden = false;
}

void BreezyDesktopEffect::hideCursor()
{
    if (m_cursorHidden) return;

    updateCursorImage();
    effects->hideCursor();
    m_cursorHidden = true;
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
        m_cursorImageSize = cursor.image().size();
    } else {
        m_cursorImageSource = QString();
        m_cursorImageSize = QSize();
    }
    // Cursor size affects the expanded geometry margin; invalidate cache.
    invalidateEffectOnScreenGeometryCache();
    Q_EMIT cursorImageSourceChanged();
}

void BreezyDesktopEffect::updateCursorPos()
{
    // Update cursor position from effects
    const auto cursor = effects->cursorImage();
    QPointF newPos = effects->cursorPos() - cursor.hotSpot();
    if (m_cursorPos != newPos) {
        const QPointF prevPos = m_cursorPos;
        m_cursorPos = newPos;
        Q_EMIT cursorPosChanged();

        evaluateCursorOnScreenState(prevPos, m_cursorPos);
    }
}

void BreezyDesktopEffect::evaluateCursorOnScreenState(const QPointF &prevPos, const QPointF &newPos)
{
    if (!updateEffectOnScreenGeometryCache()) return;

    const QPointF velocity = newPos - prevPos;
    const QPointF predicted = newPos + velocity;

    const bool onScreen = 
        m_effectOnScreenExpandedGeometry.contains(newPos.toPoint()) || 
        m_effectOnScreenExpandedGeometry.contains(predicted.toPoint());
    if (m_enabled && !m_poseResetState && !m_cursorHidden && onScreen) {
        hideCursor();
    } else if (m_cursorHidden && (!m_enabled || m_poseResetState || !onScreen)) {
        showCursor();
    }
}

void BreezyDesktopEffect::invalidateEffectOnScreenGeometryCache()
{
    m_effectOnScreenGeometryValid = false;
}

bool BreezyDesktopEffect::updateEffectOnScreenGeometryCache()
{
    if (m_effectOnScreenGeometryValid)
        return true;

    if (m_effectTargetScreenIndex == -1)
        return false;

    const auto screensList = effects->screens();
    if (m_effectTargetScreenIndex >= screensList.count()) {
        m_effectTargetScreenIndex = -1;
        return false;
    }
    Output *effectOnScreen = screensList.at(m_effectTargetScreenIndex);
    if (!effectOnScreen) {
        m_effectTargetScreenIndex = -1;
        return false;
    }

    const QRect geometry = effectOnScreen->geometry();
    const int marginX = (m_cursorImageSize.width()  > 0) ? m_cursorImageSize.width()  : 10;
    const int marginY = (m_cursorImageSize.height() > 0) ? m_cursorImageSize.height() : 10;
    m_effectOnScreenExpandedGeometry = geometry.adjusted(-marginX, -marginY, marginX, marginY);
    m_effectOnScreenGeometryValid = true;
    return true;
}

void BreezyDesktopEffect::warpPointerToOutputCenter(Output *output)
{
    if (!output) {
        return;
    }
    const QRect geometry = output->geometry();
    const QPointF center = geometry.center();
    Cursors::self()->mouse()->setPos(center);

    // When warping, we don't have a meaningful previous position; use center for both.
    evaluateCursorOnScreenState(center, center);
}

void BreezyDesktopEffect::moveCursorToFocusedDisplay()
{
    if (m_lookingAtScreenIndex == -1) return;

    warpPointerToOutputCenter(effects->screens().at(m_lookingAtScreenIndex));
}
}

#include "breezydesktopeffect.moc"