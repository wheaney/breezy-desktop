/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#include "breezydesktopeffectkcm.h"
#include "breezydesktopconfig.h"

#include <kwineffects_interface.h>

#include <KActionCollection>
#include <KGlobalAccel>
#include <KLocalizedString>
#include <KPluginFactory>

#include <QAction>
#include <QFileDialog>

K_PLUGIN_CLASS(BreezyDesktopEffectConfig)

BreezyDesktopEffectConfig::BreezyDesktopEffectConfig(QObject *parent, const KPluginMetaData &data, const QVariantList &args)
    : KCModule(parent, data)
{
    ui.setupUi(widget());
    addConfig(BreezyDesktopConfig::self(), widget());
}

BreezyDesktopEffectConfig::~BreezyDesktopEffectConfig()
{
}

void BreezyDesktopEffectConfig::load()
{
    KCModule::load();
    updateUiFromConfig();
    updateUnmanagedState();
}

void BreezyDesktopEffectConfig::save()
{
    updateConfigFromUi();
    BreezyDesktopConfig::self()->save();
    KCModule::save();
    updateUnmanagedState();

    OrgKdeKwinEffectsInterface interface(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"), QDBusConnection::sessionBus());
    interface.reconfigureEffect(QStringLiteral("breezy_desktop_effect"));
}

void BreezyDesktopEffectConfig::defaults()
{
    KCModule::defaults();
    updateUiFromDefaultConfig();
    updateUnmanagedState();
}

void BreezyDesktopEffectConfig::updateConfigFromUi()
{
}

void BreezyDesktopEffectConfig::updateUiFromConfig()
{
}

void BreezyDesktopEffectConfig::updateUiFromDefaultConfig()
{
}

void BreezyDesktopEffectConfig::updateUnmanagedState()
{
}

#include "breezydesktopeffectkcm.moc"
