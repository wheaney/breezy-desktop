#pragma once

#include "kcm/shortcuts.h"
#include <effect/quickeffect.h>

#include <QAction>
#include <QFileSystemWatcher>
#include <QImage>
#include <QKeySequence>
#include <QQuaternion>

namespace KWin
{
    class BreezyDesktopEffect : public QuickSceneEffect
    {
        Q_OBJECT
        Q_PROPERTY(bool isEnabled READ isEnabled NOTIFY enabledStateChanged)
        Q_PROPERTY(bool zoomOnFocusEnabled READ isZoomOnFocusEnabled WRITE setZoomOnFocusEnabled NOTIFY zoomOnFocusChanged)
        Q_PROPERTY(bool imuResetState READ imuResetState NOTIFY imuResetStateChanged)
        Q_PROPERTY(QList<QQuaternion> imuRotations READ imuRotations)
        Q_PROPERTY(quint32 imuTimeElapsedMs READ imuTimeElapsedMs)
        Q_PROPERTY(quint64 imuTimestamp READ imuTimestamp)
        Q_PROPERTY(QString cursorImageSource READ cursorImageSource NOTIFY cursorImageSourceChanged)
        Q_PROPERTY(QSize cursorImageSize READ cursorImageSize NOTIFY cursorImageSourceChanged)
        Q_PROPERTY(QPointF cursorPos READ cursorPos NOTIFY cursorPosChanged)
        Q_PROPERTY(QList<qreal> lookAheadConfig READ lookAheadConfig NOTIFY devicePropertiesChanged)
        Q_PROPERTY(QList<quint32> displayResolution READ displayResolution NOTIFY devicePropertiesChanged)
        Q_PROPERTY(qreal focusedDisplayDistance READ focusedDisplayDistance NOTIFY focusedDisplayDistanceChanged)
        Q_PROPERTY(qreal allDisplaysDistance READ allDisplaysDistance NOTIFY allDisplaysDistanceChanged)
        Q_PROPERTY(qreal displaySpacing READ displaySpacing NOTIFY displaySpacingChanged)
        Q_PROPERTY(qreal displayHorizontalOffset READ displayHorizontalOffset NOTIFY displayOffsetChanged)
        Q_PROPERTY(qreal displayVerticalOffset READ displayVerticalOffset NOTIFY displayOffsetChanged)
        Q_PROPERTY(int displayWrappingScheme READ displayWrappingScheme NOTIFY displayWrappingSchemeChanged)
        Q_PROPERTY(qreal diagonalFOV READ diagonalFOV NOTIFY devicePropertiesChanged)
        Q_PROPERTY(qreal lensDistanceRatio READ lensDistanceRatio NOTIFY devicePropertiesChanged)
        Q_PROPERTY(bool sbsEnabled READ sbsEnabled NOTIFY devicePropertiesChanged)
        Q_PROPERTY(bool customBannerEnabled READ customBannerEnabled NOTIFY devicePropertiesChanged)
        Q_PROPERTY(int antialiasingQuality READ antialiasingQuality NOTIFY antialiasingQualityChanged)
        Q_PROPERTY(bool removeVirtualDisplaysOnDisable READ removeVirtualDisplaysOnDisable NOTIFY removeVirtualDisplaysOnDisableChanged)

    public:

        BreezyDesktopEffect();
        ~BreezyDesktopEffect() override;

        void reconfigure(ReconfigureFlags) override;

        int requestedEffectChainPosition() const override;

        QString cursorImageSource() const;
        QSize cursorImageSize() const;
        QPointF cursorPos() const;

        bool isEnabled() const;
        bool isZoomOnFocusEnabled() const;
        void setZoomOnFocusEnabled(bool enabled);
        QList<QQuaternion> imuRotations() const;
        quint32 imuTimeElapsedMs() const;
        quint64 imuTimestamp() const;
        bool imuResetState() const;
        QList<qreal> lookAheadConfig() const;
        QList<quint32> displayResolution() const;
        qreal focusedDisplayDistance() const;
        void setFocusedDisplayDistance(qreal distance);
        qreal allDisplaysDistance() const;
        void setAllDisplaysDistance(qreal distance);
        qreal displaySpacing() const;
        void setDisplaySpacing(qreal spacing);
        qreal displayHorizontalOffset() const;
        qreal displayVerticalOffset() const;
        int displayWrappingScheme() const;
        qreal diagonalFOV() const;
        qreal lensDistanceRatio() const;
        bool sbsEnabled() const;
        bool customBannerEnabled() const;
        int antialiasingQuality() const;
        bool removeVirtualDisplaysOnDisable() const;

        void showCursor();
        void hideCursor();

    public Q_SLOTS:
        void activate();
        void deactivate();
        void enableDriver();
        void disableDriver();
        void toggle();
        void addVirtualDisplay(QSize size);
        void updateImuRotation();
        void updateCursorImage();
        void updateCursorPos();

    Q_SIGNALS:
        void focusedDisplayDistanceChanged();
        void allDisplaysDistanceChanged();
        void displaySpacingChanged();
        void displayOffsetChanged();
        void displayWrappingSchemeChanged();
        void enabledStateChanged();
        void zoomOnFocusChanged();
        void imuResetStateChanged();
        void cursorImageSourceChanged();
        void cursorPosChanged();
        void devicePropertiesChanged();
        void antialiasingQualityChanged();
        void removeVirtualDisplaysOnDisableChanged();

    protected:
        QVariantMap initialProperties(Output *screen) override;

    private:
        void teardown();
        bool checkParityByte(const char* data);
        void setupGlobalShortcut(const BreezyShortcuts::Shortcut &shortcut, 
                                 std::function<void()> triggeredFunc);
        void recenter();

        QString m_cursorImageSource;
        QSize m_cursorImageSize;

        bool m_enabled = false;
        bool m_zoomOnFocusEnabled = false;
        bool m_imuResetState;
        QList<QQuaternion> m_imuRotations;
        quint32 m_imuTimeElapsedMs;
        quint64 m_imuTimestamp = 0;
        QList<qreal> m_lookAheadConfig;
        QList<quint32> m_displayResolution;
        qreal m_diagonalFOV;
        qreal m_lensDistanceRatio;
        bool m_sbsEnabled;
        bool m_customBannerEnabled;
        QFileSystemWatcher *m_shmFileWatcher = nullptr;
        QFileSystemWatcher *m_shmDirectoryWatcher = nullptr;
        QPointF m_cursorPos;
        QTimer *m_cursorUpdateTimer = nullptr;
        qreal m_focusedDisplayDistance = 0.85;
        qreal m_allDisplaysDistance = 1.05;
        qreal m_displaySpacing = 0.0;
        qreal m_displayHorizontalOffset = 0.0;
        qreal m_displayVerticalOffset = 0.0;
        int m_displayWrappingScheme = 0; // 0=auto,1=horizontal,2=vertical,3=flat
        int m_antialiasingQuality = 3; // 0=None, 1=Medium, 2=High, 3=VeryHigh
        bool m_removeVirtualDisplaysOnDisable = true;
        QList<Output *> m_virtualOutputs;
    };

} // namespace KWin
