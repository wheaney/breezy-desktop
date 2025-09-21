#pragma once

#include <QDialog>

namespace Ui { class CustomResolutionDialog; }

class CustomResolutionDialog : public QDialog {
    Q_OBJECT
public:
    explicit CustomResolutionDialog(QWidget *parent = nullptr);
    ~CustomResolutionDialog() override;

    int widthValue() const;
    int heightValue() const;

private:
    Ui::CustomResolutionDialog *ui;
};
