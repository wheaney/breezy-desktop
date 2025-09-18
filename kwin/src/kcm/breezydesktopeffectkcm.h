#pragma once

#include <KCModule>
#include <KConfigWatcher>
#include <memory>

#include <QTimer>
#include <QVariant>
#include <QVariantList>
#include <QString>

#include "ui_breezydesktopeffectkcm.h"

class KConfigWatcher;
class KConfigGroup;

class BreezyDesktopEffectConfig : public KCModule
{
    Q_OBJECT

public:
    BreezyDesktopEffectConfig(QObject *parent, const KPluginMetaData &data);
    ~BreezyDesktopEffectConfig() override;

public Q_SLOTS:
    void load() override;
    void save() override;
    void defaults() override;

private:
    void updateDriverEnabled();
    void updateMultitapEnabled();
    void updateSmoothFollowEnabled();
    void updateUiFromConfig();
    void updateUiFromDefaultConfig();
    void updateConfigFromUi();
    void updateUnmanagedState();
    bool driverEnabled(std::optional<QJsonObject> configJsonOpt);
    bool multitapEnabled(std::optional<QJsonObject> configJsonOpt);
    bool smoothFollowEnabled(std::optional<QJsonObject> stateJsonOpt);
    void pollDriverState();
    void refreshLicenseUi(const QJsonObject &rootObj);
    void checkEffectLoaded();
    void showStatus(QLabel *label, bool success, const QString &message);
    void setRequestInProgress(std::initializer_list<QObject*> widgets, bool inProgress);
    bool eventFilter(QObject *watched, QEvent *event) override;

    // Virtual display DBus helpers and UI rendering
    QVariantList dbusListVirtualDisplays() const;
    QVariantList dbusAddVirtualDisplay(int w, int h) const;
    QVariantList dbusRemoveVirtualDisplay(const QString &id) const;
    void renderVirtualDisplays(const QVariantList &rows);

    ::Ui::BreezyDesktopEffectConfig ui;

    KConfigWatcher::Ptr m_configWatcher;
    bool m_updatingFromConfig = false;
    bool m_driverStateInitialized = false;
    bool m_deviceConnected = false;
    bool m_smoothFollowEnabled = false;
    int m_smoothFollowThreshold = 1;
    QString m_connectedDeviceBrand;
    QString m_connectedDeviceModel;
    QTimer m_statePollTimer; // periodic driver state polling
    QTimer m_virtualDisplayPollTimer; // periodic virtual display list polling
    bool m_licenseLoading = false;
};
