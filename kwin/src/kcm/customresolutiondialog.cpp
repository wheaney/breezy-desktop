#include "customresolutiondialog.h"
#include "ui_customresolutiondialog.h"

CustomResolutionDialog::CustomResolutionDialog(QWidget *parent)
    : QDialog(parent), ui(new Ui::CustomResolutionDialog)
{
    ui->setupUi(this);
}

CustomResolutionDialog::~CustomResolutionDialog() {
    delete ui;
}

int CustomResolutionDialog::widthValue() const {
    return ui->sliderWidth->value();
}

int CustomResolutionDialog::heightValue() const {
    return ui->sliderHeight->value();
}
