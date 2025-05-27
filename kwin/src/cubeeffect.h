/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#pragma once

#include <libkwineffects/kwinquickeffect.h>

#include <QKeySequence>
#include <QQuaternion>

namespace KWin
{

class CubeEffect : public QuickSceneEffect
{
    Q_OBJECT
    Q_PROPERTY(int animationDuration READ animationDuration NOTIFY animationDurationChanged)
    Q_PROPERTY(qreal cubeFaceDisplacement READ cubeFaceDisplacement NOTIFY cubeFaceDisplacementChanged)
    Q_PROPERTY(qreal distanceFactor READ distanceFactor NOTIFY distanceFactorChanged)
    Q_PROPERTY(bool mouseInvertedX READ mouseInvertedX NOTIFY mouseInvertedXChanged)
    Q_PROPERTY(bool mouseInvertedY READ mouseInvertedY NOTIFY mouseInvertedYChanged)
    Q_PROPERTY(QUrl skybox READ skybox NOTIFY skyboxChanged)
    Q_PROPERTY(BackgroundMode backgroundMode READ backgroundMode NOTIFY backgroundModeChanged)
    Q_PROPERTY(QColor backgroundColor READ backgroundColor NOTIFY backgroundColorChanged)

public:
    enum class BackgroundMode {
        Color,
        Skybox,
    };
    Q_ENUM(BackgroundMode)

    CubeEffect();

    void reconfigure(ReconfigureFlags flags) override;
    int requestedEffectChainPosition() const override;
    void grabbedKeyboardEvent(QKeyEvent *e) override;
    bool borderActivated(ElectricBorder border) override;

    int animationDuration() const;
    void setAnimationDuration(int duration);

    qreal cubeFaceDisplacement() const;
    void setCubeFaceDisplacement(qreal displacement);

    qreal distanceFactor() const;
    void setDistanceFactor(qreal factor);

    bool mouseInvertedX() const;
    void setMouseInvertedX(bool inverted);

    bool mouseInvertedY() const;
    void setMouseInvertedY(bool inverted);

    QUrl skybox() const;
    void setSkybox(const QUrl &url);

    BackgroundMode backgroundMode() const;
    void setBackgroundMode(BackgroundMode mode);

    QColor backgroundColor() const;
    void setBackgroundColor(const QColor &color);

public Q_SLOTS:
    void activate();
    void deactivate();
    void toggle();

Q_SIGNALS:
    void cubeFaceDisplacementChanged();
    void distanceFactorChanged();
    void mouseInvertedXChanged();
    void mouseInvertedYChanged();
    void animationDurationChanged();
    void skyboxChanged();
    void backgroundModeChanged();
    void backgroundColorChanged();

protected:
    QVariantMap initialProperties(EffectScreen *screen) override;

private:
    void realDeactivate();

    QTimer *m_shutdownTimer;
    QAction *m_toggleAction = nullptr;
    QList<QKeySequence> m_toggleShortcut;
    QList<ElectricBorder> m_borderActivate;
    QList<ElectricBorder> m_touchBorderActivate;
    QUrl m_skybox;
    qreal m_cubeFaceDisplacement = 100;
    qreal m_distanceFactor = 1.5;
    BackgroundMode m_backgroundMode = BackgroundMode::Color;
    QColor m_backgroundColor;
    int m_animationDuration = 200;
    bool m_mouseInvertedX = true;
    bool m_mouseInvertedY = true;
};

} // namespace KWin