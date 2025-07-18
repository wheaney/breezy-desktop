/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#include "cubeeffectkcm.h"
#include "cubeconfig.h"

#include <kwineffects_interface.h>

#include <KActionCollection>
#include <KGlobalAccel>
#include <KLocalizedString>
#include <KPluginFactory>

#include <QAction>
#include <QFileDialog>

K_PLUGIN_CLASS(CubeEffectConfig)

CubeEffectConfig::CubeEffectConfig(QObject *parent, const KPluginMetaData &data, const QVariantList &args)
    : KCModule(parent, data)
{
    ui.setupUi(widget());
    addConfig(CubeConfig::self(), widget());
}

CubeEffectConfig::~CubeEffectConfig()
{
}

void CubeEffectConfig::load()
{
    KCModule::load();
    updateUiFromConfig();
    updateUnmanagedState();
}

void CubeEffectConfig::save()
{
    updateConfigFromUi();
    CubeConfig::self()->save();
    KCModule::save();
    updateUnmanagedState();

    OrgKdeKwinEffectsInterface interface(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"), QDBusConnection::sessionBus());
    interface.reconfigureEffect(QStringLiteral("cube"));
}

void CubeEffectConfig::defaults()
{
    KCModule::defaults();
    updateUiFromDefaultConfig();
    updateUnmanagedState();
}

void CubeEffectConfig::updateConfigFromUi()
{
}

void CubeEffectConfig::updateUiFromConfig()
{
}

void CubeEffectConfig::updateUiFromDefaultConfig()
{
}

void CubeEffectConfig::updateUnmanagedState()
{
}

#include "cubeeffectkcm.moc"
