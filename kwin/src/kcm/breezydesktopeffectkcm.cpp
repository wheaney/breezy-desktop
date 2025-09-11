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
#include <QGuiApplication>
#include <QKeyEvent>
#include <QLineEdit>
#include <QLabel>
#include <QJsonValue>
#include <QJsonArray>
#include <QDesktopServices>
#include <QUrl>
#include <QProcess>
#include <QComboBox>
#include <QDBusInterface>
#include <QDBusConnection>

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

    // Show/enable Virtual Display controls only when we're on Wayland
    const bool isWaylandSession = QGuiApplication::platformName().contains(QStringLiteral("wayland"), Qt::CaseInsensitive)
        || qEnvironmentVariable("XDG_SESSION_TYPE").compare(QStringLiteral("wayland"), Qt::CaseInsensitive) == 0;
    if (isWaylandSession) {
        if (auto lbl = widget()->findChild<QLabel*>(QStringLiteral("labelVirtualDisplays"))) {
            lbl->setVisible(true);
            lbl->setEnabled(true);
        }
        if (auto row = widget()->findChild<QWidget*>(QStringLiteral("widgetVirtualDisplayButtons"))) {
            row->setVisible(true);
            row->setEnabled(true);
        }
        if (auto chk = widget()->findChild<QWidget*>(QStringLiteral("kcfg_RemoveVirtualDisplaysOnDisable"))) {
            chk->setVisible(true);
            chk->setEnabled(true);
        }
    }

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
    connect(ui.kcfg_EffectEnabled, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateDriverEnabled);
    connect(ui.kcfg_ZoomOnFocusEnabled, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_FocusedDisplayDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AllDisplaysDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplaySpacing, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayHorizontalOffset, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayVerticalOffset, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayWrappingScheme, qOverload<int>(&QComboBox::currentIndexChanged), this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AntialiasingQuality, qOverload<int>(&QComboBox::currentIndexChanged), this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_PhysicalDisplaysMode, qOverload<int>(&QComboBox::currentIndexChanged), this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_RemoveVirtualDisplaysOnDisable, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);

    if (auto label = widget()->findChild<QLabel*>("labelAppNameVersion")) {
        label->setText(QStringLiteral("Breezy Desktop - v%1").arg(QLatin1String(BREEZY_DESKTOP_VERSION_STR)));
    }

    if (auto btnEmail = widget()->findChild<QPushButton*>("buttonSubmitEmail")) {
        connect(btnEmail, &QPushButton::clicked, this, [this]() {
            auto edit = widget()->findChild<QLineEdit*>("lineEditLicenseEmail");
            auto labelStatus = widget()->findChild<QLabel*>("labelEmailStatus");
            if (!edit || edit->text().trimmed().isEmpty() || !labelStatus) return;
            setRequestInProgress({edit, sender()}, true);
            labelStatus->setVisible(false);
            bool success = XRDriverIPC::instance().requestToken(edit->text().trimmed().toStdString());
            showStatus(labelStatus, success, success ? tr("Request sent. Check your email for instructions.") : tr("Failed to send request."));
            setRequestInProgress({edit, sender()}, false);
        });
        if (auto emailEdit = widget()->findChild<QLineEdit*>("lineEditLicenseEmail")) {
            emailEdit->installEventFilter(this);
        }
    }
    if (auto btnToken = widget()->findChild<QPushButton*>("buttonSubmitToken")) {
        connect(btnToken, &QPushButton::clicked, this, [this]() {
            auto edit = widget()->findChild<QLineEdit*>("lineEditLicenseToken");
            auto labelStatus = widget()->findChild<QLabel*>("labelTokenStatus");
            if (!edit || edit->text().trimmed().isEmpty() || !labelStatus) return;
            setRequestInProgress({edit, sender()}, true);
            labelStatus->setVisible(false);
            bool success = XRDriverIPC::instance().verifyToken(edit->text().trimmed().toStdString());
            if (success) {
                XRDriverIPC::instance().writeControlFlags({{"refresh_device_license", true}});
            }
            showStatus(labelStatus, success, success ? tr("Your license has been refreshed.") : tr("Invalid or expired token."));
            setRequestInProgress({edit, sender()}, false);
        });
        if (auto tokenEdit = widget()->findChild<QLineEdit*>("lineEditLicenseToken")) {
            tokenEdit->installEventFilter(this);
        }
    }

    // Wire Add Virtual Display buttons via DBus to the effect
    auto callAddVirtualDisplay = [](int w, int h) {
        QDBusInterface iface(
            QStringLiteral("org.kde.KWin"),
            QStringLiteral("/com/xronlinux/BreezyDesktop"),
            QStringLiteral("com.xronlinux.BreezyDesktop"),
            QDBusConnection::sessionBus());
        if (iface.isValid()) {
            iface.call(QDBus::NoBlock, QStringLiteral("AddVirtualDisplay"), w, h);
        }
    };
    if (auto btn1080p = widget()->findChild<QPushButton*>("buttonAdd1080p")) {
        connect(btn1080p, &QPushButton::clicked, this, [callAddVirtualDisplay]() {
            callAddVirtualDisplay(1920, 1080);
        });
    }
    if (auto btn1440p = widget()->findChild<QPushButton*>("buttonAdd1440p")) {
        connect(btn1440p, &QPushButton::clicked, this, [callAddVirtualDisplay]() {
            callAddVirtualDisplay(2560, 1440);
        });
    }

    // General tab: Open KDE Displays Settings
    if (auto btnDisplays = widget()->findChild<QPushButton*>(QStringLiteral("buttonOpenDisplaysSettings"))) {
        connect(btnDisplays, &QPushButton::clicked, this, [this]() {
            // Try launching the KScreen KCM
            if (!QProcess::startDetached(QStringLiteral("kcmshell6"), {QStringLiteral("kcm_kscreen")})) {
                QDesktopServices::openUrl(QUrl(QStringLiteral("systemsettings://kcm_kscreen")));
            }
        });
    }
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
    ui.kcfg_DisplayHorizontalOffset->setValue(BreezyDesktopConfig::self()->displayHorizontalOffset());
    ui.kcfg_DisplayVerticalOffset->setValue(BreezyDesktopConfig::self()->displayVerticalOffset());
    ui.kcfg_DisplayWrappingScheme->setCurrentIndex(BreezyDesktopConfig::self()->displayWrappingScheme());
    ui.kcfg_AntialiasingQuality->setCurrentIndex(BreezyDesktopConfig::self()->antialiasingQuality());
    ui.kcfg_PhysicalDisplaysMode->setCurrentIndex(BreezyDesktopConfig::self()->physicalDisplaysMode());
    ui.kcfg_RemoveVirtualDisplaysOnDisable->setChecked(BreezyDesktopConfig::self()->removeVirtualDisplaysOnDisable());
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

void BreezyDesktopEffectConfig::updateDriverEnabled()
{
    if (driverEnabled() == ui.kcfg_EffectEnabled->isChecked()) {
        return;
    }

    QJsonObject newConfig = QJsonObject();
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    if (configJsonOpt) {
        newConfig = configJsonOpt.value();
    }
    if (ui.kcfg_EffectEnabled->isChecked()) {
        newConfig.insert(QStringLiteral("disabled"), false);
        newConfig.insert(QStringLiteral("output_mode"), QStringLiteral("external_only"));
        newConfig.insert(QStringLiteral("external_mode"), QStringLiteral("breezy_desktop"));
    } else {
        newConfig.insert(QStringLiteral("external_mode"), QStringLiteral("none"));
    }
    XRDriverIPC::instance().writeConfig(newConfig);
}

bool BreezyDesktopEffectConfig::driverEnabled()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    if (!configJsonOpt) return false;
    auto configJson = configJsonOpt.value();
    bool driverDisabled = configJson.value(QStringLiteral("disabled")).toBool();
    QString driverOutputMode = configJson.value(QStringLiteral("output_mode")).toString();
    QJsonArray driverExternalMode = configJson.value(QStringLiteral("external_mode")).toArray();
    return !driverDisabled &&
           driverOutputMode == QStringLiteral("external_only") &&
           driverExternalMode.contains(QJsonValue(QStringLiteral("breezy_desktop")));
}

void BreezyDesktopEffectConfig::pollDriverState()
{
    auto &bridge = XRDriverIPC::instance();
    auto stateJsonOpt = bridge.retrieveDriverState();
    if (!stateJsonOpt) return;
    auto stateJson = stateJsonOpt.value();
    m_connectedDeviceBrand = stateJson.value(QStringLiteral("connected_device_brand")).toString();
    m_connectedDeviceModel = stateJson.value(QStringLiteral("connected_device_model")).toString();

    const bool wasDeviceConnected = m_deviceConnected;
    m_deviceConnected = !m_connectedDeviceBrand.isEmpty() && !m_connectedDeviceModel.isEmpty();
    if (ui.labelDeviceConnectionStatus->text().isEmpty() || m_deviceConnected != wasDeviceConnected) {
        ui.labelDeviceConnectionStatus->setText(m_deviceConnected ?
            QStringLiteral("%1 %2 connected").arg(m_connectedDeviceBrand, m_connectedDeviceModel) :
            QStringLiteral("No device connected"));
    }

    bool effectEnabled = driverEnabled();
    if (ui.kcfg_EffectEnabled->isChecked() != effectEnabled) ui.kcfg_EffectEnabled->setChecked(effectEnabled);

    refreshLicenseUi(stateJson);
}

void BreezyDesktopEffectConfig::showStatus(QLabel *label, bool success, const QString &message) {
    if (!label) return;
    QPalette pal = label->palette();
    pal.setColor(QPalette::WindowText, success ? QColor(Qt::darkGreen) : QColor(Qt::red));
    label->setPalette(pal);
    label->setText(message);
    label->setVisible(true);
}

void BreezyDesktopEffectConfig::setRequestInProgress(std::initializer_list<QObject*> widgets, bool inProgress) {
    for (auto *obj : widgets) {
        if (auto *w = qobject_cast<QWidget*>(obj)) {
            w->setEnabled(!inProgress);
        }
    }
}

bool BreezyDesktopEffectConfig::eventFilter(QObject *watched, QEvent *event) {
    if (event->type() == QEvent::KeyPress) {
        auto *ke = static_cast<QKeyEvent*>(event);
        if (ke->key() == Qt::Key_Return || ke->key() == Qt::Key_Enter) {
            if (auto *edit = qobject_cast<QLineEdit*>(watched)) {
                // Determine which button to invoke
                QString objName = edit->objectName();
                QString buttonName;
                if (objName == QLatin1String("lineEditLicenseEmail")) buttonName = QStringLiteral("buttonSubmitEmail");
                else if (objName == QLatin1String("lineEditLicenseToken")) buttonName = QStringLiteral("buttonSubmitToken");
                if (!buttonName.isEmpty()) {
                    if (auto btn = widget()->findChild<QPushButton*>(buttonName)) {
                        // Trigger click but stop further propagation so dialog doesn't accept/close
                        QMetaObject::invokeMethod(btn, "click", Qt::QueuedConnection);
                        event->accept();
                        return true; // eat event
                    }
                }
            }
        }
    }
    return KCModule::eventFilter(watched, event);
}

static QString secondsToRemainingString(qint64 secs) {
    if (secs <= 0) return {};

    if (secs / 60 < 60) {
        return QObject::tr("less than an hour");
    }
    if (secs / 3600 < 24) {
        qint64 hours = secs / 3600;
        if (hours == 1) return QObject::tr("1 hour");
        return QObject::tr("%1 hours").arg(hours);
    }
    if ((secs / 86400) < 30 ) {
        qint64 days = secs / 86400;
        if (days == 1) return QObject::tr("1 day");
        return QObject::tr("%1 days").arg(days);
    }
    return {};
}

void BreezyDesktopEffectConfig::refreshLicenseUi(const QJsonObject &rootObj) {
    auto tab = widget()->findChild<QWidget*>("tabLicenseDetails");
    if (!tab) return;
    auto labelSummary = tab->findChild<QLabel*>("labelLicenseSummary");
    if (!labelSummary) return;
    auto donate = tab->findChild<QLabel*>("labelDonateLink");
    auto globalWarn = widget()->findChild<QLabel*>("labelGlobalLicenseWarning");

    QString status = tr("disabled");
    QString renewalDescriptor = QStringLiteral("");
    auto uiView = rootObj.value(QStringLiteral("ui_view")).toObject();
    auto license = uiView.value(QStringLiteral("license")).toObject();
    bool warningState = false;
    bool expired = false;
    if (!license.isEmpty()) {
        auto tiers = license.value(QStringLiteral("tiers")).toObject();
        QJsonValue prodTier = tiers.value(QStringLiteral("subscriber"));
        QJsonObject prodTierObj = prodTier.isUndefined() ? QJsonObject() : prodTier.toObject();

        auto features = license.value(QStringLiteral("features")).toObject();
        QJsonValue prodFeature = features.value(QStringLiteral("productivity_basic"));
        QJsonObject prodFeatureObj = prodFeature.isUndefined() ? QJsonObject() : prodFeature.toObject();
        if (!prodTierObj.isEmpty() && !prodFeatureObj.isEmpty()) {
            const QString activePeriod = prodTierObj.value(QStringLiteral("active_period")).toString();
            const bool isActive = !activePeriod.isEmpty();
            if (isActive) {
                status = tr("active");

                QString periodDescriptor = activePeriod.contains(QStringLiteral("lifetime"), Qt::CaseInsensitive) ? 
                    tr("lifetime") : 
                    tr("%1 license").arg(activePeriod);

                QString timeDescriptor;
                auto secsVal = prodTierObj.value(QStringLiteral("funds_needed_in_seconds"));
                if (secsVal.isDouble()) {
                    qint64 secs = static_cast<qint64>(secsVal.toDouble());
                    QString remaining = secondsToRemainingString(secs);
                    if (!remaining.isEmpty()) {
                        timeDescriptor = tr("%1 remaining").arg(remaining);
                    }
                }
                renewalDescriptor = tr(" (%1)").arg(periodDescriptor);
                warningState = !timeDescriptor.isEmpty();
                if (warningState) {
                    auto fundsNeeded = prodTierObj.value(QStringLiteral("funds_needed_by_period")).toObject().value(activePeriod).toDouble();
                    if (fundsNeeded > 0.0) {
                        QString fundsNeededDescriptor = tr("$%1 USD to renew").arg(fundsNeeded);
                        renewalDescriptor = tr(" (%1, %2, %3)").arg(periodDescriptor, fundsNeededDescriptor, timeDescriptor);
                    }
                }
            } else {
                QJsonValue isEnabled = prodFeatureObj.value(QStringLiteral("is_enabled"));
                QJsonValue isTrial = prodFeatureObj.value(QStringLiteral("is_trial"));
                if (isEnabled.toBool()) {
                    if (isTrial.toBool()) {
                        status = tr("in trial");
                        auto secsVal = prodFeatureObj.value(QStringLiteral("funds_needed_in_seconds"));
                        if (secsVal.isDouble()) {
                            qint64 secs = static_cast<qint64>(secsVal.toDouble());
                            QString remaining = secondsToRemainingString(secs);
                            warningState = !remaining.isEmpty();
                            if (warningState) {
                                QString timeDescriptor = tr("%1 remaining").arg(remaining);
                                renewalDescriptor = tr(" (%1)").arg(timeDescriptor);
                            }
                        }
                    }
                } else {
                    expired = true;
                }
            }
        }
    }
    const QString message = tr("Productivity Tier features are %1%2").arg(status, renewalDescriptor);
    labelSummary->setText(message);

    if (donate) donate->setVisible(warningState || expired);

    if (globalWarn) {
        if (warningState || expired) {
            globalWarn->setText(message + (expired ? tr(" — effect disabled") : QString()));
            globalWarn->setVisible(true);
        } else {
            globalWarn->clear();
            globalWarn->setVisible(false);
        }
    }

    if (expired) {
        if (ui.tabWidget) ui.tabWidget->setEnabled(false);
        OrgKdeKwinEffectsInterface interface(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"), QDBusConnection::sessionBus());
        interface.unloadEffect(QStringLiteral("breezy_desktop"));
    } else {
        if (ui.tabWidget) ui.tabWidget->setEnabled(true);
    }
}

#include "breezydesktopeffectkcm.moc"