#include "kwaylandclient.h"
#include "wayland-zkde-screencast-unstable-v1-client-protocol.h"

#include <KWayland/Client/connection_thread.h>
#include <KWayland/Client/registry.h>
#include <QLoggingCategory>
#include <QTimer>

Q_LOGGING_CATEGORY(KWAYLAND, "kwayland.xr")

using namespace KWin::Wayland;

void Client::init()
{
    auto connection = new KWayland::Client::ConnectionThread;
    connection->initConnection();
    
    connect(connection, &KWayland::Client::ConnectionThread::connected, this, [this, connection]() {
        qCCritical(KWAYLAND) << "Connected to Wayland display";
        m_registry = new KWayland::Client::Registry(this);

        connect(m_registry, &KWayland::Client::Registry::interfaceAnnounced, this, [this](const QByteArray &interfaceName, quint32 name, quint32 version) {
            if (interfaceName != "zkde_screencast_unstable_v1")
                return;

            qCCritical(KWAYLAND) << "Found screencasting interface" << interfaceName << name << version;
            m_screencasting = new Screencasting(m_registry, name, version, this);
            m_connectionReady = true;
        });
        connect(m_registry, &KWayland::Client::Registry::interfacesAnnounced, this, [this] {
            m_registryInitialized = true;
            qCCritical(KWAYLAND) << "Registry initialized";
        });

        m_registry->create(connection);
        m_registry->setup();
    });
}

bool Client::isConnectionReady()
{
    return m_connectionReady;
}

Stream Client::startVirtualDisplay(const QString &name,
                                     const QString &description,
                                     const QSize &size,
                                     Screencasting::CursorMode mode)
{
    return startStreaming(m_screencasting->createVirtualOutputStream(name, description, size, 1, mode),
                          {
                              {QLatin1String("size"), size},
                              {QLatin1String("source_type"), static_cast<uint>(Screencasting::Virtual)},
                          });
}

Stream Client::startStreaming(ScreencastingStream *stream, const QVariantMap &streamOptions)
{
    QEventLoop loop;
    Stream ret;

    connect(stream, &ScreencastingStream::failed, &loop, [&](const QString &error) {
        qCCritical(KWAYLAND) << "failed to start streaming" << stream << error;

        loop.quit();
    });
    connect(stream, &ScreencastingStream::created, &loop, [&](uint32_t nodeid) {
        ret.stream = stream;
        ret.nodeId = nodeid;
        ret.map = streamOptions;
        m_streams.append(ret);

        connect(stream, &ScreencastingStream::closed, this, [this, nodeid] {
            stopStreaming(nodeid);
        });
        Q_ASSERT(ret.isValid());

        loop.quit();
    });
    QTimer::singleShot(3000, &loop, [&loop, stream] {
        stream->deleteLater();
        loop.quit();
    });
    loop.exec();
    return ret;
}

void Client::stopStreaming(uint32_t nodeid)
{
    for (auto it = m_streams.begin(), itEnd = m_streams.end(); it != itEnd; ++it) {
        if (it->nodeId == nodeid) {
            it->close();
            m_streams.erase(it);
            break;
        }
    }
}

bool Client::isStreamingEnabled()
{
    return !m_streams.isEmpty();
}

bool Client::isStreamingAvailable()
{
    return m_screencasting;
}

void Stream::close()
{
    stream->deleteLater();
}