/*
    SPDX-FileCopyrightText: 2020 Aleix Pol Gonzalez <aleixpol@kde.org>

    SPDX-License-Identifier: LGPL-2.1-only OR LGPL-3.0-only OR LicenseRef-KDE-Accepted-LGPL
*/

#include "screencasting.h"
#include "qwayland-zkde-screencast-unstable-v1.h"

#include <KWayland/Client/output.h>
#include <KWayland/Client/plasmawindowmanagement.h>
#include <KWayland/Client/registry.h>
#include <QDebug>
#include <QRect>

using namespace KWayland::Client;

class ScreencastingStreamPrivate : public QtWayland::zkde_screencast_stream_unstable_v1
{
public:
    ScreencastingStreamPrivate(ScreencastingStream *q)
        : q(q)
    {
    }
    ~ScreencastingStreamPrivate() override
    {
        close();
        q->deleteLater();
    }

    void zkde_screencast_stream_unstable_v1_created(uint32_t node) override
    {
        m_nodeid = node;
        Q_EMIT q->created(node);
    }

    void zkde_screencast_stream_unstable_v1_closed() override
    {
        Q_EMIT q->closed();
    }

    void zkde_screencast_stream_unstable_v1_failed(const QString &error) override
    {
        Q_EMIT q->failed(error);
    }

    uint m_nodeid = 0;
    QRect m_geometry;
    QPointer<ScreencastingStream> q;
};

ScreencastingStream::ScreencastingStream(QObject *parent)
    : QObject(parent)
    , d(new ScreencastingStreamPrivate(this))
{
}

ScreencastingStream::~ScreencastingStream() = default;

quint32 ScreencastingStream::nodeid() const
{
    return d->m_nodeid;
}

QRect ScreencastingStream::geometry() const
{
    return d->m_geometry;
}

class ScreencastingPrivate : public QtWayland::zkde_screencast_unstable_v1
{
public:
    ScreencastingPrivate(Registry *registry, int id, int version, Screencasting *q)
        : QtWayland::zkde_screencast_unstable_v1(*registry, id, version)
        , q(q)
    {
    }

    ScreencastingPrivate(::zkde_screencast_unstable_v1 *screencasting, Screencasting *q)
        : QtWayland::zkde_screencast_unstable_v1(screencasting)
        , q(q)
    {
    }

    ~ScreencastingPrivate() override
    {
        destroy();
    }

    Screencasting *const q;
};

Screencasting::Screencasting(QObject *parent)
    : QObject(parent)
{
}

Screencasting::Screencasting(Registry *registry, int id, int version, QObject *parent)
    : QObject(parent)
    , d(new ScreencastingPrivate(registry, id, version, this))
{
}

Screencasting::~Screencasting() = default;

ScreencastingStream *
Screencasting::createVirtualOutputStream(const QString &name, const QString &description, const QSize &s, qreal scale, Screencasting::CursorMode mode)
{
    auto stream = new ScreencastingStream(this);
    if (d->version() >= ZKDE_SCREENCAST_UNSTABLE_V1_STREAM_VIRTUAL_OUTPUT_WITH_DESCRIPTION_SINCE_VERSION) {
        stream->d->init(d->stream_virtual_output_with_description(name, description, s.width(), s.height(), wl_fixed_from_double(scale), mode));
    } else {
        stream->d->init(d->stream_virtual_output(name, s.width(), s.height(), wl_fixed_from_double(scale), mode));
    }
    stream->d->m_geometry = QRect(QPoint(0, 0), s);
    return stream;
}

void Screencasting::setup(::zkde_screencast_unstable_v1 *screencasting)
{
    d.reset(new ScreencastingPrivate(screencasting, this));
}

void Screencasting::destroy()
{
    d.reset(nullptr);
}