/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#pragma once

#include <KCModule>

#include "ui_cubeeffectkcm.h"

class CubeEffectConfig : public KCModule
{
    Q_OBJECT

public:
    CubeEffectConfig(QObject *parent, const KPluginMetaData &data, const QVariantList &args);
    ~CubeEffectConfig() override;

public Q_SLOTS:
    void load() override;
    void save() override;
    void defaults() override;

private:
    void updateUiFromConfig();
    void updateUiFromDefaultConfig();
    void updateConfigFromUi();
    void updateUnmanagedState();

    int uiBackground() const;
    int defaultBackground() const;
    void setUiBackground(int mode);

    ::Ui::CubeEffectConfig ui;
};
