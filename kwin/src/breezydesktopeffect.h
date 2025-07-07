#pragma once

#include <effect/quickeffect.h>

#include <QAction>
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
        Q_PROPERTY(QQuaternion xrRotation READ xrRotation NOTIFY xrRotationChanged)
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

        QQuaternion xrRotation() const;

    public Q_SLOTS:
        void activate();
        void deactivate();
        void toggle();
        void updateXrRotation();
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
        void xrRotationChanged();
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

        QQuaternion m_xrRotation;
        QTimer *m_xrRotationTimer = nullptr;
        QPointF m_cursorPos;
        QTimer *m_cursorUpdateTimer = nullptr;
    };

} // namespace KWin
