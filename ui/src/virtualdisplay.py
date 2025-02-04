#!/usr/bin/python3

import logging
import sys
import signal
import pydbus
import gi
gi.require_version('Gst', '1.0')
from gi.repository import GLib, GObject, Gst

logger = logging.getLogger('breezy_ui')

screen_cast_iface = 'org.gnome.Mutter.ScreenCast'
screen_cast_session_iface = 'org.gnome.Mutter.ScreenCast.Session'
screen_cast_stream_iface = 'org.gnome.Mutter.ScreenCast.Session'
gst_pipeline_format = "pipewiresrc path=%u ! video/x-raw,max-framerate=60/1,width=%d,height=%d ! fakesink sync=false"


def _screen_cast_session():
    bus = pydbus.SessionBus()
    screen_cast = bus.get(screen_cast_iface, '/org/gnome/Mutter/ScreenCast')
    session_path = screen_cast.CreateSession([])
    logger.info("session path: %s" % session_path)
    screen_cast_session = bus.get(screen_cast_iface, session_path)

    return screen_cast_session

class VirtualMonitor:
    def __init__(self, width, height, on_ready_cb):
        self.width = width
        self.height = height
        self.on_ready_cb = on_ready_cb

        Gst.init(None)

    def create(self):
        session = _screen_cast_session()
        stream_path = session.RecordVirtual({
            'is-platform': GLib.Variant.new_boolean(True),
        })
        logger.info("stream path: %s" % stream_path)
        bus = pydbus.SessionBus()
        self.stream = bus.get(screen_cast_iface, stream_path)

        self.stream.onPipeWireStreamAdded = self._on_pipewire_stream_added

        session.Start()

    def terminate(self):
        if self.stream is not None:
            self.stream.Stop()

        if self.pipeline is not None:
            self.pipeline.send_event(Gst.Event.new_eos())
            self.pipeline.set_state(Gst.State.NULL)

    def _on_message(self, bus, message):
        type = message.type
        logger.info("message type: %s" % type)
        if type == Gst.MessageType.EOS or type == Gst.MessageType.ERROR:
            self.terminate()

    def _on_pipewire_stream_added(self, node_id):
        logger.info("pipe wire stream added: %u" % node_id)

        self.pipeline = Gst.parse_launch(gst_pipeline_format % (node_id, self.width, self.height))
        self.pipeline.set_state(Gst.State.PLAYING)
        self.pipeline.get_bus().connect('message', self._on_message)
        self.pipeline.set_state(Gst.State.PAUSED)
        
        self.on_ready_cb()