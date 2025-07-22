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
        Q_PROPERTY(bool mouseInvertedX READ mouseInvertedX NOTIFY mouseInvertedXChanged)
        Q_PROPERTY(bool mouseInvertedY READ mouseInvertedY NOTIFY mouseInvertedYChanged)
        Q_PROPERTY(BackgroundMode backgroundMode READ backgroundMode NOTIFY backgroundModeChanged)
        Q_PROPERTY(QColor backgroundColor READ backgroundColor NOTIFY backgroundColorChanged)
        Q_PROPERTY(QList<QQuaternion> imuRotations READ imuRotations NOTIFY imuRotationsChanged)
        Q_PROPERTY(quint32 imuTimeElapsedMs READ imuTimeElapsedMs NOTIFY imuRotationsChanged)
        Q_PROPERTY(quint64 imuTimestamp READ imuTimestamp NOTIFY imuRotationsChanged)
        Q_PROPERTY(quint8 lookAheadConstant READ lookAheadConstant NOTIFY imuRotationsChanged)
        Q_PROPERTY(QString cursorImageSource READ cursorImageSource NOTIFY cursorImageChanged)
        Q_PROPERTY(QPointF cursorPos READ cursorPos NOTIFY cursorPosChanged)

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
        bool mouseInvertedX() const;
        bool mouseInvertedY() const;
        BackgroundMode backgroundMode() const;
        QColor backgroundColor() const;
        QString cursorImageSource() const;
        QPointF cursorPos() const;

        void showCursor();
        void hideCursor();

        QList<QQuaternion> imuRotations() const;
        quint32 imuTimeElapsedMs() const;
        quint64 imuTimestamp() const;
        qreal lookAheadConstant() const;

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
        void mouseInvertedXChanged();
        void mouseInvertedYChanged();
        void animationDurationChanged();
        void skyboxChanged();
        void backgroundModeChanged();
        void backgroundColorChanged();
        void imuRotationsChanged();
        void cursorImageChanged();
        void cursorPosChanged();

    protected:
        QVariantMap initialProperties(Output *screen) override;

    private:
        void realDeactivate();

        QTimer *m_shutdownTimer;
        QAction *m_toggleAction = nullptr;
        QList<QKeySequence> m_toggleShortcut;
        QList<ElectricBorder> m_borderActivate;
        QList<ElectricBorder> m_touchBorderActivate;
        QString m_cursorImageSource;
        bool m_isMouseHidden = false;

        QList<QQuaternion> m_imuRotations;
        quint32 m_imuTimeElapsedMs;
        quint64 m_imuTimestamp;
        qreal m_lookAheadConstant = 10.0;
        QFileSystemWatcher *m_imuRotationFileWatcher = nullptr;
        QPointF m_cursorPos;
        QTimer *m_cursorUpdateTimer = nullptr;
    };

} // namespace KWin
