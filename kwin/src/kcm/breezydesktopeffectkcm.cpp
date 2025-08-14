/*
    SPDX-FileCopyrightText: 2022 Vlad Zahorodnii <vlad.zahorodnii@kde.org>

    SPDX-License-Identifier: GPL-2.0-only OR GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL
*/

#include "breezydesktopeffectkcm.h"

#include <KActionCollection>
#include <KGlobalAccel>
#include <KLocalizedString>
#include <KPluginFactory>

#include <QAction>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QFileDialog>
#include <QLoggingCategory>

Q_LOGGING_CATEGORY(KWIN_XR, "kwin.xr")

K_PLUGIN_CLASS(BreezyDesktopEffectConfig)

BreezyDesktopEffectConfig::BreezyDesktopEffectConfig(QObject *parent, const KPluginMetaData &data)
    : KCModule(parent, data)
{
    ui.setupUi(widget());
    
    QFile xmlFile(QStringLiteral(":/main.xml"));
    qCCritical(KWIN_XR) << "\t\t\tBreezy - xml file exists:" << xmlFile.exists();
    KConfigGroup cg = KSharedConfig::openConfig(QStringLiteral("kwinrc"))->group("Effect-breezy_desktop_effect");
    m_configLoader = new KConfigLoader(cg, &xmlFile, this);
    addConfig(m_configLoader, widget());
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
    m_configLoader->save();
    
    KCModule::save();
    updateUnmanagedState();

    QDBusMessage reconfigureMessage = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"),
                                                                     QStringLiteral("/Effects"),
                                                                     QStringLiteral("org.kde.kwin.Effects"),
                                                                     QStringLiteral("reconfigureEffect"));
    reconfigureMessage.setArguments({QStringLiteral("breezy_desktop_effect")});
    QDBusConnection::sessionBus().call(reconfigureMessage);
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
