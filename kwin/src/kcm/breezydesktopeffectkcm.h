#pragma once

#include <KCModule>
#include <KConfigWatcher>
#include <memory>

#include <QTimer>

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
    void updateUiFromConfig();
    void updateUiFromDefaultConfig();
    void updateConfigFromUi();
    void updateUnmanagedState();
    void pollDriverState();

    ::Ui::BreezyDesktopEffectConfig ui;

    KConfigWatcher::Ptr m_configWatcher;
    bool m_updatingFromConfig = false;
    bool m_deviceConnected = false;
    QString m_connectedDeviceBrand;
    QString m_connectedDeviceModel;
    QTimer m_statePollTimer; // periodic driver state polling
};
