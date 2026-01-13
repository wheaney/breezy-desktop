#pragma once

#include "kcm/shortcuts.h"
#include <effect/quickeffect.h>

#include <QAction>
#include <QFileSystemWatcher>
#include <QImage>
#include <QKeySequence>
#include <QQuaternion>
#include <QVariant>
#include <QVariantList>
#include <QHash>
#include <QRect>
#include <atomic>
class QTimer;

namespace KWin
{
    class BreezyDesktopEffect : public QuickSceneEffect
    {
        Q_OBJECT
        Q_PROPERTY(bool isEnabled READ isEnabled NOTIFY enabledStateChanged)
        Q_PROPERTY(int effectTargetScreenIndex READ effectTargetScreenIndex WRITE setEffectTargetScreenIndex)
        Q_PROPERTY(bool zoomOnFocusEnabled READ isZoomOnFocusEnabled WRITE setZoomOnFocusEnabled NOTIFY zoomOnFocusChanged)
        Q_PROPERTY(int lookingAtScreenIndex READ lookingAtScreenIndex WRITE setLookingAtScreenIndex)
        Q_PROPERTY(bool poseResetState READ poseResetState NOTIFY poseResetStateChanged)
        Q_PROPERTY(QList<QQuaternion> poseOrientations READ poseOrientations)
        Q_PROPERTY(QVector3D posePosition READ posePosition)
        Q_PROPERTY(quint32 poseTimeElapsedMs READ poseTimeElapsedMs)
        Q_PROPERTY(quint64 poseTimestamp READ poseTimestamp)
        Q_PROPERTY(QString cursorImageSource READ cursorImageSource NOTIFY cursorImageSourceChanged)
        Q_PROPERTY(QSize cursorImageSize READ cursorImageSize NOTIFY cursorImageSourceChanged)
        Q_PROPERTY(QPointF cursorPos READ cursorPos NOTIFY cursorPosChanged)
        Q_PROPERTY(QList<qreal> lookAheadConfig READ lookAheadConfig NOTIFY devicePropertiesChanged)
        Q_PROPERTY(qreal lookAheadOverride READ lookAheadOverride WRITE setLookAheadOverride NOTIFY devicePropertiesChanged)
        Q_PROPERTY(QList<quint32> displayResolution READ displayResolution NOTIFY devicePropertiesChanged)
        Q_PROPERTY(qreal focusedDisplayDistance READ focusedDisplayDistance NOTIFY focusedDisplayDistanceChanged)
        Q_PROPERTY(qreal allDisplaysDistance READ allDisplaysDistance NOTIFY allDisplaysDistanceChanged)
        Q_PROPERTY(qreal displaySpacing READ displaySpacing NOTIFY displaySpacingChanged)
        Q_PROPERTY(qreal displaySize READ displaySize NOTIFY displaySizeChanged)
        Q_PROPERTY(qreal displayHorizontalOffset READ displayHorizontalOffset NOTIFY displayOffsetChanged)
        Q_PROPERTY(qreal displayVerticalOffset READ displayVerticalOffset NOTIFY displayOffsetChanged)
        Q_PROPERTY(int displayWrappingScheme READ displayWrappingScheme NOTIFY displayWrappingSchemeChanged)
        Q_PROPERTY(qreal diagonalFOV READ diagonalFOV NOTIFY devicePropertiesChanged)
        Q_PROPERTY(qreal lensDistanceRatio READ lensDistanceRatio NOTIFY devicePropertiesChanged)
        Q_PROPERTY(bool sbsEnabled READ sbsEnabled NOTIFY sbsEnabledChanged)
        Q_PROPERTY(bool smoothFollowEnabled READ smoothFollowEnabled NOTIFY smoothFollowEnabledChanged)
        Q_PROPERTY(QList<QQuaternion> smoothFollowOrigin READ smoothFollowOrigin)
        Q_PROPERTY(bool customBannerEnabled READ customBannerEnabled NOTIFY devicePropertiesChanged)
        Q_PROPERTY(int antialiasingQuality READ antialiasingQuality NOTIFY antialiasingQualityChanged)
        Q_PROPERTY(bool removeVirtualDisplaysOnDisable READ removeVirtualDisplaysOnDisable NOTIFY removeVirtualDisplaysOnDisableChanged)
        Q_PROPERTY(bool mirrorPhysicalDisplays READ mirrorPhysicalDisplays NOTIFY mirrorPhysicalDisplaysChanged)
        Q_PROPERTY(bool curvedDisplay READ curvedDisplay NOTIFY curvedDisplayChanged)
        Q_PROPERTY(bool curvedDisplaySupported READ curvedDisplaySupported WRITE setCurvedDisplaySupported NOTIFY curvedDisplaySupportedChanged)
        Q_PROPERTY(bool developerMode READ developerMode NOTIFY developerModeChanged)


    public:

        BreezyDesktopEffect();
        ~BreezyDesktopEffect() override;

        void reconfigure(ReconfigureFlags) override;

        int requestedEffectChainPosition() const override;

        QString cursorImageSource() const;
        QSize cursorImageSize() const;
        QPointF cursorPos() const;

        bool isEnabled() const;
        int effectTargetScreenIndex() const { return m_effectTargetScreenIndex; }
        void setEffectTargetScreenIndex(int index);
        bool isZoomOnFocusEnabled() const;
        void setZoomOnFocusEnabled(bool enabled);
        int lookingAtScreenIndex() const { return m_lookingAtScreenIndex; }
        void setLookingAtScreenIndex(int index);
        QList<QQuaternion> poseOrientations() const;
        QVector3D posePosition() const;
        quint32 poseTimeElapsedMs() const;
        quint64 poseTimestamp() const;
        bool poseResetState() const;
        QList<qreal> lookAheadConfig() const;
        qreal lookAheadOverride() const;
        void setLookAheadOverride(qreal override);
        QList<quint32> displayResolution() const;
        qreal focusedDisplayDistance() const;
        void setFocusedDisplayDistance(qreal distance);
        qreal allDisplaysDistance() const;
        void setAllDisplaysDistance(qreal distance);
        qreal displaySpacing() const;
        void setDisplaySpacing(qreal spacing);
        qreal displaySize() const;
        void setDisplaySize(qreal size);
        qreal displayHorizontalOffset() const;
        qreal displayVerticalOffset() const;
        int displayWrappingScheme() const;
        qreal diagonalFOV() const;
        qreal lensDistanceRatio() const;
        bool sbsEnabled() const;
        bool smoothFollowEnabled() const;
        QList<QQuaternion> smoothFollowOrigin() const;
        bool customBannerEnabled() const;
        int antialiasingQuality() const;
        bool removeVirtualDisplaysOnDisable() const;
        bool mirrorPhysicalDisplays() const;
        bool curvedDisplay() const;
        bool developerMode() const;
        void setCurvedDisplaySupported(bool supported);

        void showCursor();
        void hideCursor();

    public Q_SLOTS:
        void activate();
        void deactivate();
        void enableDriver();
        void disableDriver();
        void toggle();
        void addVirtualDisplay(QSize size);
        void updatePose();
        void updateCursorImage();
        void updateCursorPos();
        QVariantList listVirtualDisplays() const;
        bool removeVirtualDisplay(const QString &id);
        void moveCursorToFocusedDisplay();
        bool curvedDisplaySupported() const;

    Q_SIGNALS:
        void lookAheadOverrideChanged();
        void focusedDisplayDistanceChanged();
        void allDisplaysDistanceChanged();
        void displaySpacingChanged();
        void displaySizeChanged();
        void displayOffsetChanged();
        void displayWrappingSchemeChanged();
        void enabledStateChanged();
        void zoomOnFocusChanged();
        void poseResetStateChanged();
        void sbsEnabledChanged();
        void smoothFollowEnabledChanged();
        void devicePropertiesChanged();
        void antialiasingQualityChanged();
        void removeVirtualDisplaysOnDisableChanged();
        void mirrorPhysicalDisplaysChanged();
        void curvedDisplayChanged();
        void curvedDisplaySupportedChanged();
        void developerModeChanged();
        void cursorImageSourceChanged();
        void cursorPosChanged();

    protected:
        QVariantMap initialProperties(Output *screen) override;

    private:
        void teardown();
        bool checkParityByte(const char* data);
        void setupGlobalShortcut(const BreezyShortcuts::Shortcut &shortcut, 
                                 std::function<void()> triggeredFunc);
        void recenter();
        void toggleSmoothFollow();
        void setSmoothFollowThreshold(float threshold);
        void updateDriverSmoothFollowSettings();
        void warpPointerToOutputCenter(Output *output);
        void evaluateCursorOnScreenState(const QPointF &prevPos, const QPointF &newPos);
        void invalidateEffectOnScreenGeometryCache();
        bool updateEffectOnScreenGeometryCache();

        QString m_cursorImageSource;
        QSize m_cursorImageSize;

        bool m_enabled = false;
        bool m_zoomOnFocusEnabled = false;
        int m_lookingAtScreenIndex = -1;
        int m_effectTargetScreenIndex = -1;
        bool m_poseResetState;
        QList<QQuaternion> m_poseOrientations;
        QVector3D m_posePosition;
        quint32 m_poseTimeElapsedMs;
        quint64 m_poseTimestamp = 0;
        QList<qreal> m_lookAheadConfig;
        qreal m_lookAheadOverride = -1.0; // -1 = use device default
        QList<quint32> m_displayResolution;
        qreal m_diagonalFOV;
        qreal m_lensDistanceRatio;
        bool m_sbsEnabled;
        bool m_smoothFollowEnabled;
        QList<QQuaternion> m_smoothFollowOrigin;
        bool m_customBannerEnabled;
        QFileSystemWatcher *m_shmFileWatcher = nullptr;
        QFileSystemWatcher *m_shmDirectoryWatcher = nullptr;
        bool m_cursorHidden = false;
        QPointF m_cursorPos;
        QTimer *m_cursorUpdateTimer = nullptr;
        QTimer *m_watchdogTimer = nullptr;
        std::atomic<bool> m_poseUpdateInProgress{false};
        qreal m_focusedDisplayDistance = 0.85;
        qreal m_allDisplaysDistance = 1.05;
        qreal m_displaySpacing = 0.0;
        qreal m_displaySize = 1.0;
        qreal m_displayHorizontalOffset = 0.0;
        qreal m_displayVerticalOffset = 0.0;
        int m_displayWrappingScheme = 0; // 0=auto,1=horizontal,2=vertical,3=flat
        int m_antialiasingQuality = 3; // 0=None, 1=Medium, 2=High, 3=VeryHigh
        bool m_removeVirtualDisplaysOnDisable = true;
        bool m_mirrorPhysicalDisplays = false;
        bool m_curvedDisplay = false;
        bool m_curvedDisplaySupported = false;
        bool m_developerMode = false;
        float m_smoothFollowThreshold = 1.0f;
        bool m_allDisplaysFollowMode = false;
        bool m_focusedSmoothFollowEnabled = false;

        // Cached geometry for on-screen cursor evaluation
        QRect m_effectOnScreenExpandedGeometry;
        bool m_effectOnScreenGeometryValid = false;

        struct VirtualOutputInfo {
            Output *output = nullptr;
            QString id;
            QSize size;
        };
        QHash<QString, VirtualOutputInfo> m_virtualDisplays;
    };

} // namespace KWin
