/*
    SPDX-FileCopyrightText: 2020 Aleix Pol Gonzalez <aleixpol@kde.org>

    SPDX-License-Identifier: LGPL-2.1-only OR LGPL-3.0-only OR LicenseRef-KDE-Accepted-LGPL
*/

#pragma once

#include <QList>
#include <QObject>
#include <QScreen>
#include <QSharedPointer>
#include <optional>

struct zkde_screencast_unstable_v1;

namespace KWayland
{
namespace Client
{
class PlasmaWindow;
class Registry;
class Output;
}
}

class ScreencastingPrivate;
class ScreencastingSourcePrivate;
class ScreencastingStreamPrivate;
class ScreencastingStream : public QObject
{
    Q_OBJECT
public:
    ScreencastingStream(QObject *parent);
    ~ScreencastingStream() override;

    quint32 nodeid() const;
    QRect geometry() const;

Q_SIGNALS:
    void created(quint32 nodeid);
    void failed(const QString &error);
    void closed();

private:
    friend class Screencasting;
    QScopedPointer<ScreencastingStreamPrivate> d;
};

class Screencasting : public QObject
{
    Q_OBJECT
public:
    explicit Screencasting(QObject *parent = nullptr);
    explicit Screencasting(KWayland::Client::Registry *registry, int id, int version, QObject *parent = nullptr);
    ~Screencasting() override;

    enum SourceType {
        Any = 0,
        Monitor = 1,
        Window = 2,
        Virtual = 4,
    };
    Q_ENUM(SourceType)
    Q_DECLARE_FLAGS(SourceTypes, SourceType)

    enum CursorMode {
        Hidden = 1,
        Embedded = 2,
        Metadata = 4,
    };
    Q_ENUM(CursorMode)

    ScreencastingStream *createVirtualOutputStream(const QString &name, const QString &description, const QSize &size, qreal scale, CursorMode mode);

    void setup(zkde_screencast_unstable_v1 *screencasting);
    void destroy();

Q_SIGNALS:
    void removed();
    void sourcesChanged();

private:
    QScopedPointer<ScreencastingPrivate> d;
};