#pragma once

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
        Q_PROPERTY(int animationDuration READ animationDuration NOTIFY animationDurationChanged)
        Q_PROPERTY(qreal faceDisplacement READ faceDisplacement NOTIFY faceDisplacementChanged)
        Q_PROPERTY(qreal distanceFactor READ distanceFactor NOTIFY distanceFactorChanged)
        Q_PROPERTY(BackgroundMode backgroundMode READ backgroundMode NOTIFY backgroundModeChanged)
        Q_PROPERTY(QColor backgroundColor READ backgroundColor NOTIFY backgroundColorChanged)
        Q_PROPERTY(bool isEnabled READ isEnabled NOTIFY enabledStateChanged)
        Q_PROPERTY(bool imuResetState READ imuResetState NOTIFY imuRotationsChanged)
        Q_PROPERTY(QList<QQuaternion> imuRotations READ imuRotations NOTIFY imuRotationsChanged)
        Q_PROPERTY(quint32 imuTimeElapsedMs READ imuTimeElapsedMs NOTIFY imuRotationsChanged)
        Q_PROPERTY(quint64 imuTimestamp READ imuTimestamp NOTIFY imuRotationsChanged)
        Q_PROPERTY(QString cursorImageSource READ cursorImageSource NOTIFY cursorImageChanged)
        Q_PROPERTY(QPointF cursorPos READ cursorPos NOTIFY cursorPosChanged)
        Q_PROPERTY(QList<qreal> lookAheadConfig READ lookAheadConfig NOTIFY devicePropertiesChanged)
        Q_PROPERTY(QList<quint32> displayResolution READ displayResolution NOTIFY devicePropertiesChanged)
        Q_PROPERTY(qreal diagonalFOV READ diagonalFOV NOTIFY devicePropertiesChanged)
        Q_PROPERTY(qreal lensDistanceRatio READ lensDistanceRatio NOTIFY devicePropertiesChanged)
        Q_PROPERTY(bool sbsEnabled READ sbsEnabled NOTIFY devicePropertiesChanged)
        Q_PROPERTY(bool customBannerEnabled READ customBannerEnabled NOTIFY devicePropertiesChanged)

    public:
        enum class BackgroundMode
        {
            Color,
            Skybox,
        };
        Q_ENUM(BackgroundMode)

        BreezyDesktopEffect();

        void reconfigure(ReconfigureFlags) override;

        int requestedEffectChainPosition() const override;

        int animationDuration() const;
        qreal faceDisplacement() const;
        qreal distanceFactor() const;
        BackgroundMode backgroundMode() const;
        QColor backgroundColor() const;
        QString cursorImageSource() const;
        QPointF cursorPos() const;

        bool isEnabled() const;
        QList<QQuaternion> imuRotations() const;
        quint32 imuTimeElapsedMs() const;
        quint64 imuTimestamp() const;
        bool imuResetState() const;
        QList<qreal> lookAheadConfig() const;
        QList<quint32> displayResolution() const;
        qreal diagonalFOV() const;
        qreal lensDistanceRatio() const;
        bool sbsEnabled() const;
        bool customBannerEnabled() const;

        void showCursor();
        void hideCursor();

    public Q_SLOTS:
        void activate();
        void deactivate();
        void toggle();
        void updateImuRotation();
        void updateCursorImage();
        void updateCursorPos();

    Q_SIGNALS:
        void faceDisplacementChanged();
        void distanceFactorChanged();
        void animationDurationChanged();
        void skyboxChanged();
        void backgroundModeChanged();
        void backgroundColorChanged();
        void enabledStateChanged();
        void imuRotationsChanged();
        void cursorImageChanged();
        void cursorPosChanged();
        void devicePropertiesChanged();

    protected:
        QVariantMap initialProperties(Output *screen) override;

    private:
        void realDeactivate();
        bool checkParityByte(const char* data);

        QTimer *m_shutdownTimer;
        QAction *m_toggleAction = nullptr;
        QList<QKeySequence> m_toggleShortcut;
        QList<ElectricBorder> m_borderActivate;
        QList<ElectricBorder> m_touchBorderActivate;
        QString m_cursorImageSource;

        bool m_enabled = false;
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
    };

} // namespace KWin
