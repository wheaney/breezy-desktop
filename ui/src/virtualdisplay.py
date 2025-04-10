#!/usr/bin/python3

import argparse
import logging
import sys
import signal
import pydbus
import gi
import time
    
gi.require_version('Gst', '1.0')
from gi.repository import GLib, GObject, Gst

logger = logging.getLogger('breezy_ui')

screen_cast_iface = 'org.gnome.Mutter.ScreenCast'
screen_cast_session_iface = 'org.gnome.Mutter.ScreenCast.Session'
screen_cast_stream_iface = 'org.gnome.Mutter.ScreenCast.Session'
gst_pipeline_format = "pipewiresrc path=%u ! video/x-raw,max-framerate=%d/1,width=%d,height=%d ! fakesink sync=false"

class VirtualDisplay:
    def __init__(self, width, height, framerate, on_closed_cb):
        self.width = width
        self.height = height
        self.framerate = framerate
        self.on_closed_cb = on_closed_cb

        Gst.init(None)

    def _screen_cast_session(self):
        bus = pydbus.SessionBus()
        screen_cast = bus.get(screen_cast_iface, '/org/gnome/Mutter/ScreenCast')
        session_path = screen_cast.CreateSession([])
        screen_cast_session = bus.get(screen_cast_iface, session_path)

        return screen_cast_session

    def _on_session_closed(self):
        self.stream = None
        self.terminate()

    def create(self):
        session = self._screen_cast_session()
        session.onClosed = self._on_session_closed
        stream_path = session.RecordVirtual({
            'is-platform': GLib.Variant.new_boolean(True),
        })
        bus = pydbus.SessionBus()
        self.stream = bus.get(screen_cast_iface, stream_path)

        self.stream.onPipeWireStreamAdded = self._on_pipewire_stream_added

        session.Start()

    def terminate(self):
        try:
            if self.stream is not None:
                self.stream.Stop()
        except Exception as e:
            logger.error("Failed to stop stream: %s" % e)

        try:
            if self.pipeline is not None:
                self.pipeline.send_event(Gst.Event.new_eos())
                self.pipeline.set_state(Gst.State.NULL)
        except Exception as e:
            logger.error("Failed to stop pipeline: %s" % e)

        self.on_closed_cb()

    def _on_message(self, bus, message):
        type = message.type
        logger.info("message type: %s" % type)
        if type == Gst.MessageType.EOS:
            self.pipeline = None
            self.terminate()
        elif type == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            logger.error("Error: %s" % err)
            logger.error("Debug: %s" % debug)
            self.terminate()

    def _on_pipewire_stream_added(self, node_id):
        self.pipeline = Gst.parse_launch(gst_pipeline_format % (node_id, self.framerate, self.width, self.height))
        self.pipeline.set_state(Gst.State.PLAYING)
        self.pipeline.get_bus().connect('message', self._on_message)
        self.pipeline.set_state(Gst.State.PAUSED)

def is_screencast_available():
    try:
        bus = pydbus.SessionBus()
        # Try to get the ScreenCast interface
        screen_cast = bus.get(screen_cast_iface, '/org/gnome/Mutter/ScreenCast')
        return True
    except Exception as e:
        logger.warning(f"ScreenCast portal not available: {e}")
        return False



