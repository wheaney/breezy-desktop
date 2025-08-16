#include "shortcuts.h"
#include "breezydesktopeffectkcm.h"
#include "breezydesktopconfig.h"

#include <kwineffects_interface.h>

#include <KActionCollection>
#include <KGlobalAccel>
#include <KLocalizedString>
#include <KPluginFactory>

#include <QAction>

#include <QFileDialog>

void addShortcutAction(KActionCollection *collection, const BreezyShortcuts::Shortcut &shortcut)
{
    QAction *action = collection->addAction(shortcut.actionName);
    action->setText(shortcut.actionText);
    action->setProperty("isConfigurationAction", true);
    KGlobalAccel::self()->setDefaultShortcut(action, {shortcut.shortcut});
    KGlobalAccel::self()->setShortcut(action, {shortcut.shortcut});
}

K_PLUGIN_CLASS(BreezyDesktopEffectConfig)

BreezyDesktopEffectConfig::BreezyDesktopEffectConfig(QObject *parent, const KPluginMetaData &data, const QVariantList &args)
    : KCModule(parent, data)
{
    ui.setupUi(widget());
    addConfig(BreezyDesktopConfig::self(), widget());

    auto actionCollection = new KActionCollection(this, QStringLiteral("kwin"));
    actionCollection->setComponentDisplayName(i18n("KWin"));
    actionCollection->setConfigGroup(QStringLiteral("breezy_desktop_effect"));
    actionCollection->setConfigGlobal(true);

    addShortcutAction(actionCollection, BreezyShortcuts::TOGGLE);
    addShortcutAction(actionCollection, BreezyShortcuts::RECENTER);
    ui.shortcutsEditor->addCollection(actionCollection);
    connect(ui.shortcutsEditor, &KShortcutsEditor::keyChange, this, &BreezyDesktopEffectConfig::markAsChanged);
    connect(ui.kcfg_FocusedDisplayDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AllDisplaysDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
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
    ui.shortcutsEditor->save();
}

void BreezyDesktopEffectConfig::updateUiFromConfig()
{
}

void BreezyDesktopEffectConfig::updateUiFromDefaultConfig()
{
    ui.shortcutsEditor->allDefault();
}

void BreezyDesktopEffectConfig::updateUnmanagedState()
{
}

#include "breezydesktopeffectkcm.moc"
