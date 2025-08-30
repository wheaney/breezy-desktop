#include "shortcuts.h"
#include "breezydesktopeffectkcm.h"
#include "breezydesktopconfig.h"
#include "labeledslider.h"
#include "xrdriveripc.h"

#include <kwineffects_interface.h>

#include <KActionCollection>
#include <KGlobalAccel>
#include <KLocalizedString>
#include <KConfigWatcher>
#include <KSharedConfig>
#include <KPluginFactory>

#include <QAction>

#include <QFileDialog>

Q_LOGGING_CATEGORY(KWIN_XR, "kwin.xr")

static const char EFFECT_GROUP[] = "Effect-breezy_desktop";

void addShortcutAction(KActionCollection *collection, const BreezyShortcuts::Shortcut &shortcut)
{
    QAction *action = collection->addAction(shortcut.actionName);
    action->setText(shortcut.actionText);
    action->setProperty("isConfigurationAction", true);
    KGlobalAccel::self()->setDefaultShortcut(action, {shortcut.shortcut});
    KGlobalAccel::self()->setShortcut(action, {shortcut.shortcut});
}

K_PLUGIN_CLASS(BreezyDesktopEffectConfig)

BreezyDesktopEffectConfig::BreezyDesktopEffectConfig(QObject *parent, const KPluginMetaData &data)
    : KCModule(parent, data)
{
    ui.setupUi(widget());
    addConfig(BreezyDesktopConfig::self(), widget());

    m_statePollTimer.setInterval(2000);
    m_statePollTimer.setTimerType(Qt::CoarseTimer);
    connect(&m_statePollTimer, &QTimer::timeout, this, &BreezyDesktopEffectConfig::pollDriverState);
    m_statePollTimer.start();
    
    m_configWatcher = KConfigWatcher::create(BreezyDesktopConfig::self()->sharedConfig());
    if (m_configWatcher) {
        connect(m_configWatcher.data(), &KConfigWatcher::configChanged, this,
                [this](const KConfigGroup &group) {
                    if (m_updatingFromConfig) {
                        return;
                    }
                    if (group.name() != QLatin1String(EFFECT_GROUP)) {
                        return;
                    }
                    BreezyDesktopConfig::self()->read();
                    updateUiFromConfig();
                    updateUnmanagedState();
                });
    }

    auto actionCollection = new KActionCollection(this, QStringLiteral("kwin"));
    actionCollection->setComponentDisplayName(i18n("KWin"));
    actionCollection->setConfigGroup(QStringLiteral("breezy_desktop"));
    actionCollection->setConfigGlobal(true);

    addShortcutAction(actionCollection, BreezyShortcuts::TOGGLE);
    addShortcutAction(actionCollection, BreezyShortcuts::RECENTER);
    addShortcutAction(actionCollection, BreezyShortcuts::TOGGLE_ZOOM_ON_FOCUS);
    ui.shortcutsEditor->addCollection(actionCollection);
    connect(ui.shortcutsEditor, &KShortcutsEditor::keyChange, this, &BreezyDesktopEffectConfig::markAsChanged);
    connect(ui.kcfg_FocusedDisplayDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AllDisplaysDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplaySpacing, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
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
    // Prevent reacting to the file change we ourselves are about to write.
    m_updatingFromConfig = true;
    updateConfigFromUi();
    BreezyDesktopConfig::self()->save();
    KCModule::save();
    ui.kcfg_FocusedDisplayDistance->setEnabled(ui.kcfg_ZoomOnFocusEnabled->isChecked());
    m_updatingFromConfig = false;
    updateUnmanagedState();

    OrgKdeKwinEffectsInterface interface(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"), QDBusConnection::sessionBus());
    interface.reconfigureEffect(QStringLiteral("breezy_desktop"));
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
    ui.kcfg_FocusedDisplayDistance->setValue(BreezyDesktopConfig::self()->focusedDisplayDistance());
    ui.kcfg_AllDisplaysDistance->setValue(BreezyDesktopConfig::self()->allDisplaysDistance());
    ui.kcfg_DisplaySpacing->setValue(BreezyDesktopConfig::self()->displaySpacing());
    ui.kcfg_ZoomOnFocusEnabled->setChecked(BreezyDesktopConfig::self()->zoomOnFocusEnabled());
    ui.kcfg_FocusedDisplayDistance->setEnabled(ui.kcfg_ZoomOnFocusEnabled->isChecked());
}

void BreezyDesktopEffectConfig::updateUiFromDefaultConfig()
{
    ui.shortcutsEditor->allDefault();
}

void BreezyDesktopEffectConfig::updateUnmanagedState()
{
}

void BreezyDesktopEffectConfig::pollDriverState()
{
    auto &bridge = XRDriverIPC::instance();
    auto stateOpt = bridge.retrieveDriverState();
    const XRDict &state = stateOpt.value();

    m_connectedDeviceBrand = QString::fromStdString(XRDriverIPC::string(state, XRStateEntry::ConnectedDeviceBrand));
    m_connectedDeviceModel = QString::fromStdString(XRDriverIPC::string(state, XRStateEntry::ConnectedDeviceModel));

    const bool wasDeviceConnected = m_deviceConnected;
    m_deviceConnected = !m_connectedDeviceBrand.isEmpty() && !m_connectedDeviceModel.isEmpty();
    if (m_deviceConnected != wasDeviceConnected) {
        ui.labelDeviceConnectionStatus->setText(m_deviceConnected ? 
            QStringLiteral("%1 %2 connected").arg(m_connectedDeviceBrand, m_connectedDeviceModel) : 
            QStringLiteral("No device connected"));
    }
}

#include "breezydesktopeffectkcm.moc"