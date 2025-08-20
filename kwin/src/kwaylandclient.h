#pragma once

#include <QObject>
#include <KWayland/Client/registry.h>
#include "screencasting.h"
#include "wayland-zkde-screencast-unstable-v1-client-protocol.h"

namespace KWin
{
    namespace Wayland
    {
        struct Stream {
            ScreencastingStream *stream = nullptr;
            uint nodeId;
            QVariantMap map;
            bool isValid() const
            {
                return stream != nullptr;
            }

            void close();
        };
        typedef QList<Stream> Streams;

        class Client : public QObject
        {
            Q_OBJECT
        public:
            void init();
            bool isConnectionReady();
            bool isStreamingEnabled();
            bool isStreamingAvailable();
            Stream startVirtualDisplay(const QString &name, const QString &description, const QSize &size, Screencasting::CursorMode mode);
            void stopStreaming(uint node);

        Q_SIGNALS:
            void connected();
            void disconnected();
            void errorOccurred(const QString &error);

        private:
            Stream startStreaming(ScreencastingStream *stream, const QVariantMap &streamOptions);
            bool m_registryInitialized = false;
            bool m_connectionReady = false;
            KWayland::Client::Registry *m_registry = nullptr;
            QList<Stream> m_streams;
            Screencasting *m_screencasting = nullptr;
        };

    } // namespace Wayland
} // namespace KWin

Q_DECLARE_METATYPE(KWin::Wayland::Stream)
Q_DECLARE_METATYPE(KWin::Wayland::Streams)