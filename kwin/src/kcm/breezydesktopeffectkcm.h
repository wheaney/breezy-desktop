/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#pragma once

#include <KCModule>
#include <KConfigWatcher>
#include <memory>

#include "ui_breezydesktopeffectkcm.h"

class KConfigWatcher;
class KConfigGroup;

class BreezyDesktopEffectConfig : public KCModule
{
    Q_OBJECT

public:
    BreezyDesktopEffectConfig(QObject *parent, const KPluginMetaData &data, const QVariantList &args);
    ~BreezyDesktopEffectConfig() override;

public Q_SLOTS:
    void load() override;
    void save() override;
    void defaults() override;

private:
    void updateUiFromConfig();
    void updateUiFromDefaultConfig();
    void updateConfigFromUi();
    void updateUnmanagedState();

    ::Ui::BreezyDesktopEffectConfig ui;

    KConfigWatcher::Ptr m_configWatcher;
    bool m_updatingFromConfig = false;
};
