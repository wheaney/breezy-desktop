#pragma once

#include <QWidget>

namespace Ui { class VirtualDisplayRow; }

class VirtualDisplayRow : public QWidget {
    Q_OBJECT
public:
    explicit VirtualDisplayRow(QWidget *parent = nullptr);
    ~VirtualDisplayRow() override;

    void setInfo(const QString &id, int w, int h);

Q_SIGNALS:
    void removeRequested(const QString &id);

private:
    Ui::VirtualDisplayRow *ui;
    QString m_id;
};
