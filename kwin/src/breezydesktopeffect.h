#pragma once

#include <effect/quickeffect.h>

#include <QAction>
#include <QKeySequence>
#include <QQuaternion>

namespace KWin
{
    class GLTexture;
    class GLShader;

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

    public:
        enum class BackgroundMode
        {
            Color,
            Skybox,
        };
        Q_ENUM(BackgroundMode)

        BreezyDesktopEffect();

        void paintScreen(const RenderTarget &renderTarget, const RenderViewport &viewport, int mask, const QRegion &region, Output *screen) override;

        int requestedEffectChainPosition() const override;

        int animationDuration() const;
        qreal faceDisplacement() const;
        qreal distanceFactor() const;
        bool mouseInvertedX() const;
        bool mouseInvertedY() const;
        BackgroundMode backgroundMode() const;
        QColor backgroundColor() const;

        void showCursor();
        void hideCursor();
        GLTexture *ensureCursorTexture();
        void markCursorTextureDirty();

        QQuaternion xrRotation() const;

    public Q_SLOTS:
        void activate();
        void deactivate();
        void toggle();
        void updateXrRotation();

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

    protected:
        QVariantMap initialProperties(Output *screen) override;

    private:
        void realDeactivate();

        QTimer *m_shutdownTimer;
        QAction *m_toggleAction = nullptr;
        QList<QKeySequence> m_toggleShortcut;
        QList<ElectricBorder> m_borderActivate;
        QList<ElectricBorder> m_touchBorderActivate;
        std::unique_ptr<GLTexture> m_cursorTexture;
        bool m_cursorTextureDirty = false;
        bool m_isMouseHidden = false;

        QQuaternion m_xrRotation;
        QTimer *m_xrRotationTimer = nullptr;
    };

} // namespace KWin
