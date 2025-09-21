#include "virtualdisplayrow.h"
#include "ui_virtualdisplayrow.h"

#include <QIcon>

VirtualDisplayRow::VirtualDisplayRow(QWidget *parent)
    : QWidget(parent), ui(new Ui::VirtualDisplayRow)
{
    ui->setupUi(this);
    // Set themed icons at runtime to honor system theme
    ui->icon->setPixmap(QIcon::fromTheme(QStringLiteral("video-display-symbolic")).pixmap(16, 16));
    ui->buttonRemove->setIcon(QIcon::fromTheme(QStringLiteral("user-trash-symbolic")));

    connect(ui->buttonRemove, &QPushButton::clicked, this, [this]() {
        Q_EMIT removeRequested(m_id);
    });
}

VirtualDisplayRow::~VirtualDisplayRow() {
    delete ui;
}

void VirtualDisplayRow::setInfo(const QString &id, int w, int h) {
    m_id = id;
    ui->labelId->setText(id);
    ui->labelRes->setText(QStringLiteral("%1x%2").arg(w).arg(h));
}
