#pragma once

#include <QSlider>
#include <QPainter>
#include <QPainterPath>
#include <QStyleOptionSlider>
#include <algorithm> // for std::max

/*
 * LabeledSlider
 * Horizontal QSlider that draws numeric labels at tick intervals and (optionally) a value bubble.
 * Usage:
 *   auto *s = new LabeledSlider(parent);
 *   s->setMinimum(20);
 *   s->setMaximum(250);
 *   s->setTickInterval(20);
 *   s->setTickPosition(QSlider::TicksBelow);
 *   s->setShowValueBubble(true);
 */

class LabeledSlider : public QSlider {
    Q_OBJECT
    Q_PROPERTY(bool showValueBubble READ showValueBubble WRITE setShowValueBubble)
    // decimalShift: number of places to shift the decimal point left for display ONLY.
    // Example: raw value 250 with decimalShift=2 displays as 2.50. Underlying slider value
    // (signals, stored config) remains 250.
    Q_PROPERTY(int decimalShift READ decimalShift WRITE setDecimalShift)
public:
    explicit LabeledSlider(QWidget *parent = nullptr)
        : QSlider(Qt::Horizontal, parent)
    {
        setTickPosition(QSlider::TicksBelow);
    }

    bool showValueBubble() const { return m_showValueBubble; }
    void setShowValueBubble(bool on) {
        if (m_showValueBubble == on) return;
        m_showValueBubble = on;
        update();
    }

    int decimalShift() const { return m_decimalShift; }
    void setDecimalShift(int shift) {
        // clamp to sensible range
        if (shift < 0) shift = 0;
        if (shift > 6) shift = 6; // avoid large power-of-10 overflow
        if (m_decimalShift == shift) return;
        m_decimalShift = shift;
        updateGeometry();
        update();
    }

    QSize sizeHint() const override {
        QSize sz = QSlider::sizeHint();
        int extraH = 0;
        if (labelInterval() > 0) {
            // Reserve space for bottom labels
            QFontMetrics fm(font());
            extraH += fm.height() + 4;
        }
        if (m_showValueBubble) {
            QFontMetrics fm(font());
            extraH = std::max(extraH, fm.height() + 8); // bubble might be above
        }
        sz.setHeight(sz.height() + extraH);
        return sz;
    }

protected:
    void paintEvent(QPaintEvent *e) override {
        QSlider::paintEvent(e);

        QStyleOptionSlider opt;
        initStyleOption(&opt);

        QPainter p(this);
        p.setRenderHint(QPainter::Antialiasing, true);

        const int minV = minimum();
        const int maxV = maximum();

        // Draw labels below ticks
        if (labelInterval() > 0) {
            QFontMetrics fm(font());
            const int baselineY = height() - fm.descent() - 1;
            int interval = labelInterval();
            for (int v = minV; v <= maxV; v += interval) {
                // Use style geometry for handle at this position to match tick placement.
                QStyleOptionSlider optPos = opt;
                optPos.sliderPosition = v;
                optPos.sliderValue = v;
                QRect handleAtVal = style()->subControlRect(QStyle::CC_Slider, &optPos, QStyle::SC_SliderHandle, this);
                int x = handleAtVal.center().x();
                QString text = valueToDisplayString(v);
                int halfW = fm.horizontalAdvance(text) / 2;
                QRect r(x - halfW, baselineY - fm.ascent(), fm.horizontalAdvance(text), fm.height());
                p.drawText(r, Qt::AlignCenter, text);
            }
        }

        // Draw floating value bubble over handle
        if (m_showValueBubble) {
            // Handle rect
            const QRect handle = style()->subControlRect(QStyle::CC_Slider, &opt, QStyle::SC_SliderHandle, this);
            QString valText = valueToDisplayString(value());
            QFontMetrics fm(font());
            QRect textRect = fm.boundingRect(valText);
            textRect.adjust(-6, -4, 6, 4);

            // Position bubble above the handle; add extra lift
            const int extraLift = 10;   // requested additional pixels
            const int gap = 4;          // minimal gap between handle top and bubble
            int topY = handle.top() - gap - extraLift - textRect.height();
            if (topY < 0) topY = 0;     // clamp to widget
            textRect.moveTop(topY);
            textRect.moveLeft(handle.center().x() - textRect.width()/2);

            // Bubble shape
            QPainterPath path;
            path.addRoundedRect(textRect, 6, 6);

            p.setPen(Qt::NoPen);
            p.setBrush(palette().toolTipBase());
            p.drawPath(path);

            p.setPen(palette().toolTipText().color());
            p.drawText(textRect, Qt::AlignCenter, valText);
        }
    }

private:
    QString valueToDisplayString(int raw) const {
        if (m_decimalShift == 0) {
            return QString::number(raw);
        }
        int divisor = 1;
        for (int i = 0; i < m_decimalShift; ++i) divisor *= 10; // small loop, m_decimalShift capped
        int whole = raw / divisor;
        int frac = std::abs(raw % divisor);
        QString fracStr = QString::number(frac).rightJustified(m_decimalShift, QLatin1Char('0'));
        return QString::number(whole) + QLatin1Char('.') + fracStr;
    }

    bool m_showValueBubble = true;
    int  m_decimalShift = 0; // display-only decimal shift
private:
    int labelInterval() const {
        int ti = tickInterval();
        if (ti > 0) return ti;
        // Heuristic fallback: divide range into ~10 segments.
        int range = maximum() - minimum();
        if (range <= 0) return 0;
        int approx = range / 10;
        if (approx <= 0) approx = range; // single label at ends
        return approx;
    }
};