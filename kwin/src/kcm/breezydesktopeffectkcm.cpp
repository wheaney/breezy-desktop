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
#include <QDBusReply>
#include <QDBusVariant>
#include <QDBusArgument>
#include <QVariant>
#include <QVariantList>
#include <QHBoxLayout>
#include <QPushButton>
#include <QIcon>
#include <QTabWidget>

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

K_PLUGIN_CLASS_WITH_JSON(BreezyDesktopEffectConfig, "kcm_metadata.json")

BreezyDesktopEffectConfig::BreezyDesktopEffectConfig(QObject *parent, const KPluginMetaData &data)
    : KCModule(parent, data)
{
    ui.setupUi(widget());
    addConfig(BreezyDesktopConfig::self(), widget());

    // One-time check if the KWin effect backend is actually loaded. If not, disable UI early.
    checkEffectLoaded();

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
    connect(ui.EffectEnabled, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateDriverEnabled);
    connect(ui.kcfg_ZoomOnFocusEnabled, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_FocusedDisplayDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AllDisplaysDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplaySpacing, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayHorizontalOffset, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayVerticalOffset, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_LookAheadOverride, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayWrappingScheme, qOverload<int>(&QComboBox::currentIndexChanged), this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AntialiasingQuality, qOverload<int>(&QComboBox::currentIndexChanged), this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_MirrorPhysicalDisplays, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_RemoveVirtualDisplaysOnDisable, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.EnableMultitap, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateMultitapEnabled);

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
    if (auto btn1080p = widget()->findChild<QPushButton*>("buttonAdd1080p")) {
        connect(btn1080p, &QPushButton::clicked, this, [this]() {
            auto list = dbusAddVirtualDisplay(1920, 1080);
            renderVirtualDisplays(list);
        });
    }
    if (auto btn1440p = widget()->findChild<QPushButton*>("buttonAdd1440p")) {
        connect(btn1440p, &QPushButton::clicked, this, [this]() {
            auto list = dbusAddVirtualDisplay(2560, 1440);
            renderVirtualDisplays(list);
        });
    }
    if (auto lookAheadOverrideSlider = widget()->findChild<LabeledSlider*>("kcfg_LookAheadOverride")) {
        lookAheadOverrideSlider->setValueText(-1, i18n("Default"));
    }

    renderVirtualDisplays(dbusListVirtualDisplays());

    m_virtualDisplayPollTimer.setInterval(15000);
    m_virtualDisplayPollTimer.setTimerType(Qt::CoarseTimer);
    connect(&m_virtualDisplayPollTimer, &QTimer::timeout, this, [this]() {
        renderVirtualDisplays(dbusListVirtualDisplays());
    });
    m_virtualDisplayPollTimer.start();

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
    ui.kcfg_LookAheadOverride->setValue(BreezyDesktopConfig::self()->lookAheadOverride());
    ui.kcfg_DisplayWrappingScheme->setCurrentIndex(BreezyDesktopConfig::self()->displayWrappingScheme());
    ui.kcfg_AntialiasingQuality->setCurrentIndex(BreezyDesktopConfig::self()->antialiasingQuality());
    ui.kcfg_MirrorPhysicalDisplays->setChecked(BreezyDesktopConfig::self()->mirrorPhysicalDisplays());
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

void BreezyDesktopEffectConfig::checkEffectLoaded() {
    OrgKdeKwinEffectsInterface iface(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"), QDBusConnection::sessionBus());
    QDBusReply<bool> reply = iface.call(QStringLiteral("isEffectLoaded"), QStringLiteral("breezy_desktop"));
    if (!reply.isValid() || !reply.value()) {
        if (auto tabWidget = widget()->findChild<QTabWidget*>()) {
            tabWidget->setEnabled(false);
        }
        if (auto warn = widget()->findChild<QLabel*>(QStringLiteral("labelGlobalWarning"))) {
            QPalette pal = warn->palette();
            pal.setColor(QPalette::WindowText, QColor(Qt::red));
            warn->setPalette(pal);
            warn->setText(tr("The Breezy Desktop KWin effect is not loaded. Please log out and back in to enable it."));
            warn->setVisible(true);
        }
    }
}

static QDBusInterface makeVDInterface() {
    return QDBusInterface(
        QStringLiteral("org.kde.KWin"),
        QStringLiteral("/com/xronlinux/BreezyDesktop"),
        QStringLiteral("com.xronlinux.BreezyDesktop"),
        QDBusConnection::sessionBus());
}

QVariantList BreezyDesktopEffectConfig::dbusListVirtualDisplays() const {
    QDBusInterface iface = makeVDInterface();
    if (!iface.isValid()) return {};
    QDBusReply<QVariantList> reply = iface.call(QStringLiteral("ListVirtualDisplays"));
    return reply.isValid() ? reply.value() : QVariantList{};
}

QVariantList BreezyDesktopEffectConfig::dbusAddVirtualDisplay(int w, int h) const {
    QDBusInterface iface = makeVDInterface();
    if (!iface.isValid()) return {};
    // Fire add, then fetch authoritative list to avoid marshalling quirks
    iface.call(QStringLiteral("AddVirtualDisplay"), w, h);
    QDBusReply<QVariantList> list = iface.call(QStringLiteral("ListVirtualDisplays"));
    return list.isValid() ? list.value() : QVariantList{};
}

QVariantList BreezyDesktopEffectConfig::dbusRemoveVirtualDisplay(const QString &id) const {
    QDBusInterface iface = makeVDInterface();
    if (!iface.isValid()) return {};
    // Fire remove, then fetch authoritative list to avoid marshalling quirks
    iface.call(QStringLiteral("RemoveVirtualDisplay"), id);
    QDBusReply<QVariantList> list = iface.call(QStringLiteral("ListVirtualDisplays"));
    return list.isValid() ? list.value() : QVariantList{};
}

void BreezyDesktopEffectConfig::renderVirtualDisplays(const QVariantList &rows) {
    auto listContainer = widget()->findChild<QWidget*>(QStringLiteral("widgetVirtualDisplayList"));
    auto listLayout = listContainer ? qobject_cast<QVBoxLayout*>(listContainer->layout()) : nullptr;
    if (!listContainer || !listLayout) return;

    while (QLayoutItem *child = listLayout->takeAt(0)) {
        if (auto w = child->widget()) w->deleteLater();
        delete child;
    }

    const bool hasRows = !rows.isEmpty();
    listContainer->setVisible(hasRows);
    listContainer->setEnabled(hasRows);

    auto toMapCompat = [](const QVariant &v) -> QVariantMap {
        if (v.metaType().id() == QMetaType::QVariantMap) {
            return v.toMap();
        }
        if (v.canConvert<QDBusVariant>()) {
            const QDBusVariant dv = v.value<QDBusVariant>();
            if (dv.variant().metaType().id() == QMetaType::QVariantMap) {
                return dv.variant().toMap();
            }
        }
        if (v.metaType().id() == qMetaTypeId<QDBusArgument>()) {
            const QDBusArgument arg = v.value<QDBusArgument>();
            QVariantMap map;
            arg.beginMap();
            while (!arg.atEnd()) {
                arg.beginMapEntry();
                QString key; QVariant val;
                QDBusArgument &nonConst = const_cast<QDBusArgument&>(arg);
                nonConst >> key >> val;
                arg.endMapEntry();
                map.insert(key, val);
            }
            arg.endMap();
            return map;
        }
        return QVariantMap{};
    };

    auto unwrapValue = [](QVariant v) -> QVariant {
        if (v.canConvert<QDBusVariant>()) {
            const QDBusVariant dv = v.value<QDBusVariant>();
            return dv.variant();
        }
        return v;
    };

    for (const QVariant &rowVar : rows) {
        const QVariantMap row = toMapCompat(rowVar);
        const QString id = unwrapValue(row.value(QStringLiteral("id"))).toString();
        const int w = unwrapValue(row.value(QStringLiteral("width"))).toInt();
        const int h = unwrapValue(row.value(QStringLiteral("height"))).toInt();

        QWidget *rowWidget = new QWidget(listContainer);
        auto *hl = new QHBoxLayout(rowWidget);
        hl->setContentsMargins(0, 0, 0, 0);

        auto *spacer = new QWidget(rowWidget);
        spacer->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
        hl->addWidget(spacer, 1);

        auto *icon = new QLabel(rowWidget);
        icon->setPixmap(QIcon::fromTheme(QStringLiteral("video-display-symbolic")).pixmap(16, 16));
        icon->setContentsMargins(8, 0, 8, 0);
        hl->addWidget(icon, 0);

        auto *idLabel = new QLabel(QStringLiteral("%1").arg(id), rowWidget);
        idLabel->setContentsMargins(8, 0, 8, 0);
        hl->addWidget(idLabel, 0);

        auto *resLabel = new QLabel(QStringLiteral("%1x%2").arg(w).arg(h), rowWidget);
        resLabel->setContentsMargins(8, 0, 8, 0);
        hl->addWidget(resLabel, 0);

        auto *removeBtn = new QPushButton(rowWidget);
        removeBtn->setIcon(QIcon::fromTheme(QStringLiteral("user-trash-symbolic")));
        removeBtn->setToolTip(QStringLiteral("Remove virtual display"));
        removeBtn->setObjectName(QStringLiteral("remove-virtual-display"));
        hl->addWidget(removeBtn, 0);

        connect(removeBtn, &QPushButton::clicked, this, [this, id]() {
            auto list = dbusRemoveVirtualDisplay(id);
            renderVirtualDisplays(list);
        });

        listLayout->addWidget(rowWidget);
    }
}

void BreezyDesktopEffectConfig::updateDriverEnabled()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    if (driverEnabled(configJsonOpt) == ui.EffectEnabled->isChecked()) {
        return;
    }

    QJsonObject newConfig = QJsonObject();
    if (configJsonOpt) {
        newConfig = configJsonOpt.value();
    }
    if (ui.EffectEnabled->isChecked()) {
        newConfig.insert(QStringLiteral("disabled"), false);
        newConfig.insert(QStringLiteral("output_mode"), QStringLiteral("external_only"));
        newConfig.insert(QStringLiteral("external_mode"), QStringLiteral("breezy_desktop"));
    } else {
        newConfig.insert(QStringLiteral("external_mode"), QStringLiteral("none"));
    }
    XRDriverIPC::instance().writeConfig(newConfig);
}

bool BreezyDesktopEffectConfig::driverEnabled(std::optional<QJsonObject> configJsonOpt)
{
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
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    if (!stateJsonOpt || !configJsonOpt) return;
    auto stateJson = stateJsonOpt.value();
    m_connectedDeviceBrand = stateJson.value(QStringLiteral("connected_device_brand")).toString();
    m_connectedDeviceModel = stateJson.value(QStringLiteral("connected_device_model")).toString();

    const bool wasDeviceConnected = m_deviceConnected;
    m_deviceConnected = !m_connectedDeviceBrand.isEmpty() && !m_connectedDeviceModel.isEmpty();
    if (!m_driverStateInitialized || m_deviceConnected != wasDeviceConnected) {
        ui.labelDeviceConnectionStatus->setText(m_deviceConnected ?
            QStringLiteral("%1 %2 connected").arg(m_connectedDeviceBrand, m_connectedDeviceModel) :
            QStringLiteral("No device connected"));
    }

    bool effectEnabled = driverEnabled(configJsonOpt);
    if (ui.EffectEnabled->isChecked() != effectEnabled) ui.EffectEnabled->setChecked(effectEnabled);
    bool multitap = multitapEnabled(configJsonOpt);
    if (ui.EnableMultitap->isChecked() != multitap) ui.EnableMultitap->setChecked(multitap);

    refreshLicenseUi(stateJson);

    m_driverStateInitialized = true;
}

bool BreezyDesktopEffectConfig::multitapEnabled(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return false;
    auto configJson = configJsonOpt.value();
    return configJson.value(QStringLiteral("multi_tap_enabled")).toBool();
}

void BreezyDesktopEffectConfig::updateMultitapEnabled()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    if (multitapEnabled(configJsonOpt) == ui.EnableMultitap->isChecked()) {
        return;
    }

    QJsonObject newConfig = QJsonObject();
    if (configJsonOpt) {
        newConfig = configJsonOpt.value();
    }
    newConfig.insert(QStringLiteral("multi_tap_enabled"), ui.EnableMultitap->isChecked());
    XRDriverIPC::instance().writeConfig(newConfig);
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
    auto globalWarn = widget()->findChild<QLabel*>("labelGlobalWarning");

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

    if (globalWarn && !globalWarn->isVisible()) {
        if (warningState || expired) {
            globalWarn->setText(message + (expired ? tr(" — effect disabled") : QString()));
            globalWarn->setVisible(true);
        } else {
            globalWarn->clear();
            globalWarn->setVisible(false);
        }
    }

    if (expired) {
        ui.EffectEnabled->setChecked(false);
        ui.EffectEnabled->setEnabled(false);
    } else {
        ui.EffectEnabled->setEnabled(true);
    }
}

#include "breezydesktopeffectkcm.moc"