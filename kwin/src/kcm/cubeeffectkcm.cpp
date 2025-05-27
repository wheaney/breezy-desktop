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
    : KCModule(parent, data, args)
{
    ui.setupUi(widget());
    addConfig(CubeConfig::self(), widget());

    auto actionCollection = new KActionCollection(this, QStringLiteral("kwin"));
    actionCollection->setComponentDisplayName(i18n("KWin"));
    actionCollection->setConfigGroup(QStringLiteral("cube"));
    actionCollection->setConfigGlobal(true);

    const QKeySequence defaultToggleShortcut = Qt::META | Qt::Key_C;
    QAction *toggleAction = actionCollection->addAction(QStringLiteral("Cube"));
    toggleAction->setText(i18n("Toggle Cube"));
    toggleAction->setProperty("isConfigurationAction", true);
    KGlobalAccel::self()->setDefaultShortcut(toggleAction, {defaultToggleShortcut});
    KGlobalAccel::self()->setShortcut(toggleAction, {defaultToggleShortcut});

    ui.shortcutsEditor->addCollection(actionCollection);
    connect(ui.shortcutsEditor, &KShortcutsEditor::keyChange, this, &CubeEffectConfig::markAsChanged);

    connect(ui.button_SelectSkyBox, &QPushButton::clicked, this, [this]() {
        auto dialog = new QFileDialog(widget());
        dialog->setFileMode(QFileDialog::ExistingFile);
        connect(dialog, &QFileDialog::fileSelected, ui.kcfg_SkyBox, &QLineEdit::setText);
        dialog->open();
    });

    connect(ui.button_Color, &QPushButton::toggled, this, &CubeEffectConfig::updateUnmanagedState);
    connect(ui.button_SkyBox, &QPushButton::toggled, this, &CubeEffectConfig::updateUnmanagedState);
}

CubeEffectConfig::~CubeEffectConfig()
{
    // If save() is called, undo() has no effect.
    ui.shortcutsEditor->undo();
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
    CubeConfig::setBackground(uiBackground());
    ui.shortcutsEditor->save();
}

void CubeEffectConfig::updateUiFromConfig()
{
    setUiBackground(CubeConfig::background());
}

void CubeEffectConfig::updateUiFromDefaultConfig()
{
    setUiBackground(defaultBackground());
    ui.shortcutsEditor->allDefault();
}

int CubeEffectConfig::uiBackground() const
{
    if (ui.button_SkyBox->isChecked()) {
        return CubeConfig::EnumBackground::Skybox;
    } else {
        return CubeConfig::EnumBackground::Color;
    }
}

int CubeEffectConfig::defaultBackground() const
{
    return CubeConfig::EnumBackground::Color;
}

void CubeEffectConfig::setUiBackground(int mode)
{
    switch (mode) {
    case CubeConfig::EnumBackground::Skybox:
        ui.button_SkyBox->setChecked(true);
        break;
    case CubeConfig::EnumBackground::Color:
    default:
        ui.button_Color->setChecked(true);
        break;
    }
}

void CubeEffectConfig::updateUnmanagedState()
{
    unmanagedWidgetChangeState(CubeConfig::background() != uiBackground());
    unmanagedWidgetDefaultState(CubeConfig::background() != defaultBackground());
}

#include "cubeeffectkcm.moc"
