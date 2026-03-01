#include "shortcuts.h"
#include "breezydesktopeffectkcm.h"
#include "breezydesktopconfig.h"
#include "labeledslider.h"
#include "xrdriveripc.h"
#include "customresolutiondialog.h"
#include "virtualdisplayrow.h"

#include <kwineffects_interface.h>

#include <KActionCollection>
#include <KGlobalAccel>
#include <KLocalizedString>
#include <KConfigWatcher>
#include <KSharedConfig>
#include <KConfigGroup>
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
#include <QInputDialog>
#include <QSize>
#include <QDialog>
#include <QDialogButtonBox>
#include <QVBoxLayout>
#include <QFormLayout>
#include <QSlider>
#include <QFile>
#include <QDir>
#include <QJsonDocument>
#include <QDebug>
#include <QLocale>
#include <QSignalBlocker>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <cmath>
#include <algorithm>

Q_LOGGING_CATEGORY(KWIN_XR, "kwin.xr")

static const char EFFECT_GROUP[] = "Effect-breezy_desktop";

namespace {
// Roles for QComboBox items
constexpr int ROLE_SIZE = Qt::UserRole + 1;             // QVariant::fromValue(QSize)
constexpr int ROLE_IS_CUSTOM = Qt::UserRole + 2;        // bool
constexpr int ROLE_IS_ADD_CUSTOM = Qt::UserRole + 3;    // bool

QString stateDirPath()
{
    const QString fallback = QDir::homePath() + QStringLiteral("/.local/state");
    const QString base = qEnvironmentVariable("XDG_STATE_HOME", fallback);
    return QDir::cleanPath(base + QStringLiteral("/breezy_kwin"));
}

QString customResolutionsFilePath()
{
    return stateDirPath() + QStringLiteral("/custom_resolutions.json");
}

QStringList loadCustomResolutions()
{
    QFile f(customResolutionsFilePath());
    if (!f.exists()) return {};
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text)) return {};
    const QByteArray data = f.readAll();
    f.close();
    const QJsonDocument doc = QJsonDocument::fromJson(data);
    if (!doc.isArray()) return {};
    QStringList out;
    const QJsonArray arr = doc.array();
    for (const QJsonValue &v : arr) {
        if (!v.isString()) continue;
        const QString s = v.toString().trimmed();
        if (s.isEmpty()) continue;
        if (!out.contains(s)) out << s; // dedupe while reading to keep UI clean
    }
    return out;
}

void saveCustomResolutions(const QStringList &list)
{
    QDir().mkpath(stateDirPath());
    QFile f(customResolutionsFilePath());
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) return;
    QJsonArray arr;
    for (const QString &s : list) arr.push_back(s);
    const QJsonDocument doc(arr);
    f.write(doc.toJson(QJsonDocument::Compact));
    f.close();
}

bool parseResString(const QString &text, int &w, int &h)
{
    const QString t = text.trimmed().toLower();
    const QString xChar = QString::fromUtf8("x");
    const QString multChar = QString::fromUtf8("×");
    QString s = t;
    s.replace(multChar, xChar);
    const QStringList parts = s.split(QLatin1Char('x'), Qt::SkipEmptyParts);
    if (parts.size() != 2) return false;
    bool okW=false, okH=false;
    int ww = parts[0].toInt(&okW);
    int hh = parts[1].toInt(&okH);
    if (!okW || !okH) return false;
    if (ww < 320 || hh < 200) return false;
    if (ww > 32768 || hh > 32768) return false;
    w = ww; h = hh; return true;
}

void addResolutionItem(QComboBox *combo, QString label, QSize resolution, bool isCustom, bool isAddCustom) {
    combo->addItem(label);
    combo->setItemData(combo->count()-1, QVariant::fromValue(resolution), ROLE_SIZE);
    combo->setItemData(combo->count()-1, isCustom, ROLE_IS_CUSTOM);
    combo->setItemData(combo->count()-1, isAddCustom, ROLE_IS_ADD_CUSTOM);
}

void populateResolutionCombo(QComboBox *combo, const QStringList &custom)
{
    if (!combo) return;
    combo->clear();

    addResolutionItem(combo, QStringLiteral("1080p"), QSize(1920,1080), false, false);
    addResolutionItem(combo, QStringLiteral("1440p"), QSize(2560,1440), false, false);

    for (const QString &res : custom) {
        int w=0,h=0;
        if (!parseResString(res, w, h)) continue;
        const QString label = QStringLiteral("%1x%2").arg(w).arg(h);
        addResolutionItem(combo, label, QSize(w,h), true, false);
    }

    addResolutionItem(combo, QObject::tr("Add custom…"), QSize(), false, true);

    combo->setCurrentIndex(0);
}

bool isCustomIndex(const QComboBox *combo, int index)
{
    if (!combo || index < 0 || index >= combo->count()) return false;
    return combo->itemData(index, ROLE_IS_CUSTOM).toBool();
}

bool isAddCustomIndex(const QComboBox *combo, int index)
{
    if (!combo || index < 0 || index >= combo->count()) return false;
    return combo->itemData(index, ROLE_IS_ADD_CUSTOM).toBool();
}

QSize sizeForIndex(const QComboBox *combo, int index)
{
    if (!combo || index < 0 || index >= combo->count()) return {};
    QVariant v = combo->itemData(index, ROLE_SIZE);
    if (!v.isValid()) return {};
    return v.toSize();
}

bool showCustomResolutionDialog(QWidget *parent, int &outW, int &outH)
{
    CustomResolutionDialog dlg(parent);
    const int res = dlg.exec();
    if (res == QDialog::Accepted) {
        outW = dlg.widthValue();
        outH = dlg.heightValue();
        return true;
    }
    return false;
}

}

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

    // safe to request on each load, acts as a no-op if already present
    {
        QJsonObject flags;
        QJsonArray requested;
        requested.append(QStringLiteral("productivity_basic"));
        flags.insert(QStringLiteral("request_features"), requested);
        XRDriverIPC::instance().writeControlFlags(flags);
    }

    // Advanced tab: measurement units selector (stored as "cm" or "in")
    if (ui.comboMeasurementUnits) {
        ui.comboMeasurementUnits->clear();
        ui.comboMeasurementUnits->addItem(i18n("Centimeters (cm)"), QStringLiteral("cm"));
        ui.comboMeasurementUnits->addItem(i18n("Inches (in)"), QStringLiteral("in"));

        {
            QSignalBlocker b(ui.comboMeasurementUnits);
            const QString saved = KConfigGroup(BreezyDesktopConfig::self()->sharedConfig(), QLatin1String(EFFECT_GROUP))
                                      .readEntry(QStringLiteral("measurement_units"), QStringLiteral("cm"));
            const int idx = ui.comboMeasurementUnits->findData(saved);
            ui.comboMeasurementUnits->setCurrentIndex(idx >= 0 ? idx : 0);
        }

        connect(ui.comboMeasurementUnits, qOverload<int>(&QComboBox::currentIndexChanged), this, [this](int) {
            if (m_updatingFromConfig) return;
            applyDistanceLabelFormatters();
            save();
        });
    }

    // One-time check if the KWin effect backend is actually loaded. If not, disable UI early.
    checkEffectLoaded();

    // Asynchronously check GitHub for a newer release.
    checkForUpdates();

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

        // Initialize the resolution picker controls
        if (auto combo = widget()->findChild<QComboBox*>(QStringLiteral("comboAddVirtualDisplay"))) {
            QStringList custom = loadCustomResolutions();
            populateResolutionCombo(combo, custom);

            auto removeBtn = widget()->findChild<QPushButton*>(QStringLiteral("buttonRemoveCustomResolution"));
            auto addBtn = widget()->findChild<QPushButton*>(QStringLiteral("buttonAddVirtualDisplay"));

            combo->setProperty("lastResIndex", 0);

            auto updateRemoveUi = [combo, removeBtn, addBtn]() {
                if (!removeBtn) return;
                const bool customSel = isCustomIndex(combo, combo->currentIndex());
                removeBtn->setEnabled(customSel);
                removeBtn->setVisible(customSel);
                if (addBtn) addBtn->setEnabled(!isAddCustomIndex(combo, combo->currentIndex()));
            };

            connect(combo, qOverload<int>(&QComboBox::currentIndexChanged), this, [this, combo, updateRemoveUi]() {
                const int idx = combo->currentIndex();
                if (isAddCustomIndex(combo, idx)) {
                    const int oldIdx = combo->property("lastResIndex").toInt();
                    int w = 1920, h = 1080;
                    if (showCustomResolutionDialog(widget(), w, h)) {
                        const QString label = QStringLiteral("%1x%2").arg(w).arg(h);
                        QStringList custom = loadCustomResolutions();
                        if (!custom.contains(label)) {
                            custom << label;
                            saveCustomResolutions(custom);
                        }
                        populateResolutionCombo(combo, custom);
                        const int newIndex = combo->findText(label);
                        if (newIndex >= 0) combo->setCurrentIndex(newIndex);
                        combo->setProperty("lastResIndex", combo->currentIndex());
                    } else {
                        // Revert to previous selection if dialog cancelled
                        combo->setCurrentIndex(oldIdx);
                    }
                } else {
                    combo->setProperty("lastResIndex", idx);
                }
                updateRemoveUi();
            });
            updateRemoveUi();

            if (removeBtn) {
                connect(removeBtn, &QPushButton::clicked, this, [this, combo]() {
                    const int idx = combo->currentIndex();
                    if (!isCustomIndex(combo, idx)) return;
                    const QString label = combo->itemText(idx);
                    QStringList custom = loadCustomResolutions();
                    custom.removeAll(label);
                    saveCustomResolutions(custom);
                    populateResolutionCombo(combo, custom);
                });
            }


            if (addBtn) {
                connect(addBtn, &QPushButton::clicked, this, [this, combo]() {
                    const int idx = combo->currentIndex();
                    const QSize sz = sizeForIndex(combo, idx);
                    if (sz.isValid()) {
                        auto list = dbusAddVirtualDisplay(sz.width(), sz.height());
                        renderVirtualDisplays(list);
                    }
                });
            }
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
    addShortcutAction(actionCollection, BreezyShortcuts::TOGGLE_FOLLOW_MODE);
    addShortcutAction(actionCollection, BreezyShortcuts::CURSOR_TO_FOCUSED_DISPLAY);
    ui.shortcutsEditor->addCollection(actionCollection);
    connect(ui.shortcutsEditor, &KShortcutsEditor::keyChange, this, &BreezyDesktopEffectConfig::markAsChanged);
    connect(ui.EffectEnabled, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateDriverEnabled);
    connect(ui.SmoothFollowEnabled, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateSmoothFollowEnabled);
    connect(ui.kcfg_ZoomOnFocusEnabled, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_FocusedDisplayDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AllDisplaysDistance, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplaySize, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplaySpacing, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_SmoothFollowThreshold, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayHorizontalOffset, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayVerticalOffset, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_LookAheadOverride, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_DisplayWrappingScheme, qOverload<int>(&QComboBox::currentIndexChanged), this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AntialiasingQuality, qOverload<int>(&QComboBox::currentIndexChanged), this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_MirrorPhysicalDisplays, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_RemoveVirtualDisplaysOnDisable, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_AllDisplaysFollowMode, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.kcfg_CurvedDisplay, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::save);
    connect(ui.EnableMultitap, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateMultitapEnabled);
    connect(ui.SmoothFollowTrackYaw, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateSmoothFollowTrackYaw);
    connect(ui.SmoothFollowTrackPitch, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateSmoothFollowTrackPitch);
    connect(ui.SmoothFollowTrackRoll, &QCheckBox::toggled, this, &BreezyDesktopEffectConfig::updateSmoothFollowTrackRoll);
    connect(ui.NeckSaverHorizontalMultiplier, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::updateNeckSaverHorizontal);
    connect(ui.NeckSaverVerticalMultiplier, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::updateNeckSaverVertical);
    connect(ui.DeadZoneThresholdDeg, &QSlider::valueChanged, this, &BreezyDesktopEffectConfig::updateDeadZoneThresholdDeg);

    if (ui.DeadZoneThresholdDeg) {
        ui.DeadZoneThresholdDeg->setValueUnitsSuffix(QStringLiteral("°"));
        ui.DeadZoneThresholdDeg->setValueText(0, i18n("Disabled"));
    }

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
                QJsonObject flags; 
                flags.insert(QStringLiteral("refresh_device_license"), true);
                XRDriverIPC::instance().writeControlFlags(flags);
            }
            showStatus(labelStatus, success, success ? tr("Your license has been refreshed.") : tr("Invalid or expired token."));
            setRequestInProgress({edit, sender()}, false);
        });
        if (auto tokenEdit = widget()->findChild<QLineEdit*>("lineEditLicenseToken")) {
            tokenEdit->installEventFilter(this);
        }
    }

    // Resolution picker wiring handled above in Wayland section
    if (auto lookAheadOverrideSlider = widget()->findChild<LabeledSlider*>("kcfg_LookAheadOverride")) {
        lookAheadOverrideSlider->setValueText(-1, i18n("Default"));
    }

    applyDistanceLabelFormatters();

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

    // Advanced tab: Force reset xr-driver (matches the Python UI's reset action)
    if (auto btnResetDriver = widget()->findChild<QPushButton*>(QStringLiteral("buttonResetDriver"))) {
        connect(btnResetDriver, &QPushButton::clicked, this, [this]() {
            auto labelStatus = widget()->findChild<QLabel*>(QStringLiteral("labelResetDriverStatus"));
            if (labelStatus) {
                labelStatus->setVisible(false);
            }

            setRequestInProgress({sender()}, true);

            const bool ok = XRDriverIPC::instance().resetDriver();
            if (ok) {
                showStatus(labelStatus, true, tr("Driver restarted."));
            } else {
                showStatus(labelStatus, false, tr("Failed to restart driver."));
            }

            setRequestInProgress({sender()}, false);
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

    // Store measurement_units explicitly (snake_case key) without depending on KConfigXT accessor naming.
    {
        KConfigGroup grp(BreezyDesktopConfig::self()->sharedConfig(), QLatin1String(EFFECT_GROUP));
        grp.writeEntry(QStringLiteral("measurement_units"), measurementUnitsFromUi());
        grp.sync();
    }

    KCModule::save();
    ui.kcfg_FocusedDisplayDistance->setEnabled(
        ui.kcfg_ZoomOnFocusEnabled->isChecked() || ui.SmoothFollowEnabled->isChecked());
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
    ui.kcfg_DisplaySize->setValue(BreezyDesktopConfig::self()->displaySize());
    ui.kcfg_DisplaySpacing->setValue(BreezyDesktopConfig::self()->displaySpacing());
    ui.kcfg_DisplayHorizontalOffset->setValue(BreezyDesktopConfig::self()->displayHorizontalOffset());
    ui.kcfg_DisplayVerticalOffset->setValue(BreezyDesktopConfig::self()->displayVerticalOffset());
    ui.kcfg_LookAheadOverride->setValue(BreezyDesktopConfig::self()->lookAheadOverride());
    ui.kcfg_DisplayWrappingScheme->setCurrentIndex(BreezyDesktopConfig::self()->displayWrappingScheme());
    ui.kcfg_AntialiasingQuality->setCurrentIndex(BreezyDesktopConfig::self()->antialiasingQuality());
    ui.kcfg_MirrorPhysicalDisplays->setChecked(BreezyDesktopConfig::self()->mirrorPhysicalDisplays());
    ui.kcfg_CurvedDisplay->setChecked(BreezyDesktopConfig::self()->curvedDisplay());
    ui.kcfg_RemoveVirtualDisplaysOnDisable->setChecked(BreezyDesktopConfig::self()->removeVirtualDisplaysOnDisable());
    ui.kcfg_AllDisplaysFollowMode->setChecked(BreezyDesktopConfig::self()->allDisplaysFollowMode());
    ui.kcfg_ZoomOnFocusEnabled->setChecked(BreezyDesktopConfig::self()->zoomOnFocusEnabled());
    ui.kcfg_FocusedDisplayDistance->setEnabled(
        ui.kcfg_ZoomOnFocusEnabled->isChecked() || ui.SmoothFollowEnabled->isChecked());
    ui.kcfg_SmoothFollowThreshold->setValue(BreezyDesktopConfig::self()->smoothFollowThreshold());

    if (ui.comboMeasurementUnits) {
        QSignalBlocker b(ui.comboMeasurementUnits);
        const QString saved = KConfigGroup(BreezyDesktopConfig::self()->sharedConfig(), QLatin1String(EFFECT_GROUP))
                                  .readEntry(QStringLiteral("measurement_units"), QStringLiteral("cm"));
        const int idx = ui.comboMeasurementUnits->findData(saved);
        ui.comboMeasurementUnits->setCurrentIndex(idx >= 0 ? idx : 0);
    }

    applyDistanceLabelFormatters();
}

void BreezyDesktopEffectConfig::updateUiFromDefaultConfig()
{
    ui.shortcutsEditor->allDefault();

    if (ui.comboMeasurementUnits) {
        QSignalBlocker b(ui.comboMeasurementUnits);
        const int idx = ui.comboMeasurementUnits->findData(QStringLiteral("cm"));
        ui.comboMeasurementUnits->setCurrentIndex(idx >= 0 ? idx : 0);
    }

    applyDistanceLabelFormatters();
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
            warn->setText(tr("The Breezy Desktop KWin effect is disabled or not loaded. Please check the Desktop Effects dialog. Otherwise, log out and back in to enable it."));
            warn->setVisible(true);
        }
    }
}

void BreezyDesktopEffectConfig::checkForUpdates() {
#ifdef BREEZY_DESKTOP_VERSION_STR
    // Skip update check for system-wide installs (e.g. AUR) — the package
    // manager handles updates there.  Scripted installs put the plugin under
    // the user's home directory, so we use that as the heuristic.
    const QString pluginPath = metaData().fileName();
    const QString home = QDir::homePath();
    if (!pluginPath.startsWith(home + QLatin1Char('/')))
        return;

    if (!m_networkManager)
        m_networkManager = new QNetworkAccessManager(this);

    QNetworkRequest request(QUrl(QStringLiteral("https://api.github.com/repos/wheaney/breezy-desktop/releases/latest")));
    request.setHeader(QNetworkRequest::UserAgentHeader, QStringLiteral("breezy-desktop-kcm"));
    auto *reply = m_networkManager->get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            qCDebug(KWIN_XR) << "Update check failed:" << reply->errorString();
            return;
        }

        const QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        if (!doc.isObject()) return;
        const QString latestTag = doc.object().value(QStringLiteral("tag_name")).toString();
        if (latestTag.isEmpty()) return;

        QString latest = latestTag;
        if (latest.startsWith(QLatin1Char('v'))) latest.remove(0, 1);

        // Compare version tuples
        const QString current = QLatin1String(BREEZY_DESKTOP_VERSION_STR);
        auto parseParts = [](const QString &v) -> QList<int> {
            QList<int> parts;
            for (const QString &p : v.split(QLatin1Char('.'))) {
                bool ok;
                int n = p.toInt(&ok);
                if (!ok) return {};
                parts.append(n);
            }
            return parts;
        };
        const QList<int> latestParts = parseParts(latest);
        const QList<int> currentParts = parseParts(current);
        if (latestParts.isEmpty() || currentParts.isEmpty()) return;
        bool isNewer = false;
        for (int i = 0; i < qMax(latestParts.size(), currentParts.size()); ++i) {
            int lv = i < latestParts.size() ? latestParts[i] : 0;
            int cv = i < currentParts.size() ? currentParts[i] : 0;
            if (lv != cv) {
                isNewer = lv > cv;
                break;
            }
        }

        if (isNewer) {
            if (auto label = widget()->findChild<QLabel*>(QStringLiteral("labelUpdateAvailable"))) {
                label->setText(tr("A newer version (%1) is available. To update, rerun the breezy_kwin_setup script.").arg(latest));
                label->setVisible(true);
            }
        }
    });
#endif
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

bool BreezyDesktopEffectConfig::dbusCurvedDisplaySupported() const {
    QDBusInterface iface = makeVDInterface();
    if (!iface.isValid()) return false;
    QDBusReply<bool> reply = iface.call(QStringLiteral("CurvedDisplaySupported"));
    return reply.isValid() && reply.value();
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

        auto *rowWidget = new VirtualDisplayRow(listContainer);
        rowWidget->setInfo(id, w, h);
        connect(rowWidget, &VirtualDisplayRow::removeRequested, this, [this](const QString &vid) {
            auto list = dbusRemoveVirtualDisplay(vid);
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
    m_connectedDeviceFullDistanceCm = stateJson.value(QStringLiteral("connected_device_full_distance_cm")).toDouble(0.0);
    m_connectedDeviceFullSizeCm = stateJson.value(QStringLiteral("connected_device_full_size_cm")).toDouble(0.0);
    m_connectedDevicePoseHasPosition = stateJson.value(QStringLiteral("connected_device_pose_has_position")).toBool(false);

    applyDistanceLabelFormatters();

    const bool smoothFollow = smoothFollowEnabled(stateJsonOpt);
    if (ui.SmoothFollowEnabled->isChecked() != smoothFollow) {
        ui.SmoothFollowEnabled->setChecked(smoothFollow);

        ui.kcfg_FocusedDisplayDistance->setEnabled(ui.kcfg_ZoomOnFocusEnabled->isChecked() || smoothFollow);
    }

    const bool wasDeviceConnected = m_deviceConnected;
    m_deviceConnected = !m_connectedDeviceBrand.isEmpty() && !m_connectedDeviceModel.isEmpty();
    if (!m_driverStateInitialized || m_deviceConnected != wasDeviceConnected) {
        ui.labelDeviceConnectionStatus->setText(m_deviceConnected ?
            QStringLiteral("%1 %2 connected").arg(m_connectedDeviceBrand, m_connectedDeviceModel) :
            QStringLiteral("No device connected"));
    }

    if (m_deviceConnected) {
        if (!dbusCurvedDisplaySupported()) {
            if (m_curvedDisplaySupported) {
                m_curvedDisplaySupported = false;
                ui.kcfg_CurvedDisplay->setEnabled(false);
                ui.kcfg_CurvedDisplay->setToolTip(QObject::tr("This feature requires Qt version 6.6 or higher"));
            }
        } else {
            if (!m_curvedDisplaySupported) {
                m_curvedDisplaySupported = true;
                ui.kcfg_CurvedDisplay->setEnabled(true);
                ui.kcfg_CurvedDisplay->setToolTip(QString());
            }
        }
    }

    bool effectEnabled = driverEnabled(configJsonOpt);
    if (ui.EffectEnabled->isChecked() != effectEnabled) ui.EffectEnabled->setChecked(effectEnabled);
    bool multitap = multitapEnabled(configJsonOpt);
    if (ui.EnableMultitap->isChecked() != multitap) ui.EnableMultitap->setChecked(multitap);

    const bool trackYaw = smoothFollowTrackYawEnabled(configJsonOpt);
    if (ui.SmoothFollowTrackYaw->isChecked() != trackYaw)
        ui.SmoothFollowTrackYaw->setChecked(trackYaw);
    const bool trackPitch = smoothFollowTrackPitchEnabled(configJsonOpt);
    if (ui.SmoothFollowTrackPitch->isChecked() != trackPitch)
        ui.SmoothFollowTrackPitch->setChecked(trackPitch);
    const bool trackRoll = smoothFollowTrackRollEnabled(configJsonOpt);
    if (ui.SmoothFollowTrackRoll->isChecked() != trackRoll)
        ui.SmoothFollowTrackRoll->setChecked(trackRoll);

    const double horiz = neckSaverHorizontalMultiplier(configJsonOpt);
    const int horizInt = static_cast<int>(std::round(horiz * 100.0));
    if (ui.NeckSaverHorizontalMultiplier->value() != horizInt) {
        ui.NeckSaverHorizontalMultiplier->setValue(horizInt);
    }
    const double vert  = neckSaverVerticalMultiplier(configJsonOpt);
    const int vertInt = static_cast<int>(std::round(vert * 100.0));
    if (ui.NeckSaverVerticalMultiplier->value() != vertInt) {
        ui.NeckSaverVerticalMultiplier->setValue(vertInt);
    }

    const double dz = deadZoneThresholdDeg(configJsonOpt);
    const int dzInt = static_cast<int>(std::round(dz * 10.0));
    if (ui.DeadZoneThresholdDeg->value() != dzInt) {
        ui.DeadZoneThresholdDeg->setValue(dzInt);
    }

    refreshLicenseUi(stateJson);

    m_driverStateInitialized = true;
}

QString BreezyDesktopEffectConfig::measurementUnitsFromUi() const
{
    if (!ui.comboMeasurementUnits) return QStringLiteral("cm");
    const QString v = ui.comboMeasurementUnits->currentData().toString();
    if (v == QLatin1String("in")) return QStringLiteral("in");
    return QStringLiteral("cm");
}

void BreezyDesktopEffectConfig::applyDistanceLabelFormatters()
{
    auto *focused = ui.kcfg_FocusedDisplayDistance;
    auto *all = ui.kcfg_AllDisplaysDistance;
    if (!focused || !all) {
        return;
    }

    // Only apply the unit conversion labels when the driver reports positional tracking.
    if (!m_connectedDevicePoseHasPosition) {
        focused->clearValueToDisplayStringFn();
        all->clearValueToDisplayStringFn();
        focused->setValueUnitsSuffix(QString());
        all->setValueUnitsSuffix(QString());
        return;
    }

    const double fullCm = static_cast<double>(m_connectedDeviceFullDistanceCm);
    const QString units = measurementUnitsFromUi();
    const QLocale loc;

    // Units should appear only in the floating value bubble, not on tick labels.
    focused->setValueUnitsSuffix(units);
    all->setValueUnitsSuffix(units);

    LabeledSlider::ValueToDisplayStringFn fn = [fullCm, units, loc](int raw) -> QString {
        if (fullCm <= 0.0) return QString();
        const double ratio = static_cast<double>(raw) / 100.0; // slider uses a 2-decimal fixed-point scale
        const double cm = ratio * fullCm;
        if (units == QLatin1String("in")) {
            const double inches = cm / 2.54;
            return loc.toString(inches, 'f', 1);
        }
        return loc.toString(cm, 'f', 0);
    };

    focused->setValueToDisplayStringFn(fn);
    all->setValueToDisplayStringFn(fn);
}

double BreezyDesktopEffectConfig::neckSaverHorizontalMultiplier(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return 1.0;
    const QJsonValue jv = configJsonOpt->value(QStringLiteral("neck_saver_horizontal_multiplier"));
    const double v = jv.isDouble() ? jv.toDouble() : 1.0;
    if (v < 1.0) return 1.0;
    if (v > 2.5) return 2.5;
    return v;
}

double BreezyDesktopEffectConfig::neckSaverVerticalMultiplier(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return 1.0;
    const QJsonValue jv = configJsonOpt->value(QStringLiteral("neck_saver_vertical_multiplier"));
    const double v = jv.isDouble() ? jv.toDouble() : 1.0;
    if (v < 1.0) return 1.0;
    if (v > 2.5) return 2.5;
    return v;
}

double BreezyDesktopEffectConfig::deadZoneThresholdDeg(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return 0.0;
    const QJsonValue jv = configJsonOpt->value(QStringLiteral("dead_zone_threshold_deg"));
    const double v = jv.isDouble() ? jv.toDouble() : 0.0;
    if (v < 0.0) return 0.0;
    if (v > 5.0) return 5.0;
    return v;
}

void BreezyDesktopEffectConfig::updateNeckSaverHorizontal()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    double val = ui.NeckSaverHorizontalMultiplier->value() / 100.0;
    if (neckSaverHorizontalMultiplier(configJsonOpt) == val) return;

    QJsonObject newConfig = configJsonOpt ? configJsonOpt.value() : QJsonObject();
    newConfig.insert(QStringLiteral("neck_saver_horizontal_multiplier"), val);
    XRDriverIPC::instance().writeConfig(newConfig);
}

void BreezyDesktopEffectConfig::updateNeckSaverVertical()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    double val = ui.NeckSaverVerticalMultiplier->value() / 100.0;
    if (neckSaverVerticalMultiplier(configJsonOpt) == val) return;

    QJsonObject newConfig = configJsonOpt ? configJsonOpt.value() : QJsonObject();
    newConfig.insert(QStringLiteral("neck_saver_vertical_multiplier"), val);
    XRDriverIPC::instance().writeConfig(newConfig);
}

void BreezyDesktopEffectConfig::updateDeadZoneThresholdDeg()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();

    int raw = ui.DeadZoneThresholdDeg->value();
    const int clampedRaw = std::clamp(raw, 0, 50);
    if (raw != clampedRaw) {
        QSignalBlocker b(ui.DeadZoneThresholdDeg);
        ui.DeadZoneThresholdDeg->setValue(clampedRaw);
        raw = clampedRaw;
    }

    double val = raw / 10.0;
    val = std::clamp(val, 0.0, 5.0);

    const double current = deadZoneThresholdDeg(configJsonOpt);
    if (std::abs(current - val) < 1e-9) return;

    QJsonObject newConfig = configJsonOpt ? configJsonOpt.value() : QJsonObject();
    newConfig.insert(QStringLiteral("dead_zone_threshold_deg"), val);
    XRDriverIPC::instance().writeConfig(newConfig);
}

bool BreezyDesktopEffectConfig::multitapEnabled(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return false;
    auto configJson = configJsonOpt.value();
    return configJson.value(QStringLiteral("multi_tap_enabled")).toBool();
}

bool BreezyDesktopEffectConfig::smoothFollowEnabled(std::optional<QJsonObject> stateJsonOpt)
{
    if (!stateJsonOpt) return false;
    auto stateJson = stateJsonOpt.value();
    return stateJson.value(QStringLiteral("breezy_desktop_smooth_follow_enabled")).toBool();
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

void BreezyDesktopEffectConfig::updateSmoothFollowEnabled()
{
    auto stateJsonOpt = XRDriverIPC::instance().retrieveDriverState();
    if (smoothFollowEnabled(stateJsonOpt) == ui.SmoothFollowEnabled->isChecked()) {
        return;
    }
    bool enabled = ui.SmoothFollowEnabled->isChecked();
    QJsonObject flags; 
    flags.insert(QStringLiteral("enable_breezy_desktop_smooth_follow"), enabled);
    XRDriverIPC::instance().writeControlFlags(flags);

    ui.kcfg_FocusedDisplayDistance->setEnabled(ui.kcfg_ZoomOnFocusEnabled->isChecked() || enabled);
}

bool BreezyDesktopEffectConfig::smoothFollowTrackYawEnabled(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return true; // fallback if config missing entirely
    return configJsonOpt->value(QStringLiteral("smooth_follow_track_yaw")).toBool();
}

bool BreezyDesktopEffectConfig::smoothFollowTrackPitchEnabled(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return true; // fallback if config missing entirely
    return configJsonOpt->value(QStringLiteral("smooth_follow_track_pitch")).toBool();
}

bool BreezyDesktopEffectConfig::smoothFollowTrackRollEnabled(std::optional<QJsonObject> configJsonOpt)
{
    if (!configJsonOpt) return false; // fallback if config missing entirely
    return configJsonOpt->value(QStringLiteral("smooth_follow_track_roll")).toBool();
}

void BreezyDesktopEffectConfig::updateSmoothFollowTrackYaw()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    const bool current = smoothFollowTrackYawEnabled(configJsonOpt);
    const bool desired = ui.SmoothFollowTrackYaw->isChecked();
    if (current == desired) return;

    QJsonObject newConfig = configJsonOpt ? configJsonOpt.value() : QJsonObject();
    newConfig.insert(QStringLiteral("smooth_follow_track_yaw"), desired);
    XRDriverIPC::instance().writeConfig(newConfig);
}

void BreezyDesktopEffectConfig::updateSmoothFollowTrackPitch()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    const bool current = smoothFollowTrackPitchEnabled(configJsonOpt);
    const bool desired = ui.SmoothFollowTrackPitch->isChecked();
    if (current == desired) return;

    QJsonObject newConfig = configJsonOpt ? configJsonOpt.value() : QJsonObject();
    newConfig.insert(QStringLiteral("smooth_follow_track_pitch"), desired);
    XRDriverIPC::instance().writeConfig(newConfig);
}

void BreezyDesktopEffectConfig::updateSmoothFollowTrackRoll()
{
    auto configJsonOpt = XRDriverIPC::instance().retrieveConfig();
    const bool current = smoothFollowTrackRollEnabled(configJsonOpt);
    const bool desired = ui.SmoothFollowTrackRoll->isChecked();
    if (current == desired) return;

    QJsonObject newConfig = configJsonOpt ? configJsonOpt.value() : QJsonObject();
    newConfig.insert(QStringLiteral("smooth_follow_track_roll"), desired);
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