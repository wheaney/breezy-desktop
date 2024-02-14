#!/usr/bin/python3

from pydbus import SessionBus
from dbus.mainloop.glib import DBusGMainLoop

# from vulkan_render import BreezyDesktopVulkanApp
from remote_desktop import RemoteDesktopHandler

import faulthandler

import gi
gi.require_version('Gst', '1.0')
from gi.repository import GLib, GObject, Gst

import numpy as np


DBusGMainLoop(set_as_default=True)
Gst.init(None)

loop = GLib.MainLoop()

bus = SessionBus()
screen_cast_iface = 'org.gnome.Mutter.ScreenCast'
screen_cast_session_iface = 'org.gnome.Mutter.ScreenCast.Session'

remote_desktop_iface = 'org.gnome.Mutter.RemoteDesktop'
remote_desktop_session_iface = 'org.gnome.Mutter.RemoteDesktop.Session'

remote_desktop = bus.get(remote_desktop_iface, '/org/gnome/Mutter/RemoteDesktop')
remote_desktop_session_path = remote_desktop.CreateSession()
remote_desktop_session = bus.get(remote_desktop_iface, remote_desktop_session_path)

print("remote desktop session id: %s" % remote_desktop_session.SessionId)

screen_cast = bus.get(screen_cast_iface, '/org/gnome/Mutter/ScreenCast')
screen_case_session_path = screen_cast.CreateSession(
    {'remote-desktop-session-id': GLib.Variant('s', remote_desktop_session.SessionId)})
print("session path: %s" % screen_case_session_path)
screen_cast_session = bus.get(screen_cast_iface, screen_case_session_path)

stream_path = screen_cast_session.RecordVirtual({'cursor-mode': GLib.Variant('u', 1)})
format_element = "video/x-raw,max-framerate=60/1,width=%d,height=%d !" % (1920, 1080)

print("format_element: %s" % format_element)
print("stream path: %s" % stream_path)
stream = bus.get(screen_cast_iface, stream_path)

RemoteDesktopHandler(remote_desktop_session, stream_path)

# renderer = BreezyDesktopVulkanApp()
# renderer.setup()

pipeline = None
def terminate():
    global pipeline
    if pipeline is not None:
        print("draining pipeline")
        pipeline.send_event(Gst.Event.new_eos())
        pipeline.set_state(Gst.State.NULL)
    print("stopping")
    remote_desktop_session.Stop()
    loop.quit()


def on_message(bus, message):
    type = message.type
    if type == Gst.MessageType.EOS or type == Gst.MessageType.ERROR:
        terminate()

def on_pipewire_stream_added(node_id):
    global pipeline

    pipeline_str = (
            'pipewiresrc path=%u ! videoconvert ! videoscale ! %s videoconvert ! filesink location=/dev/shm/gfifo' % (node_id, format_element)
    )
    print(pipeline_str)
    pipeline = Gst.parse_launch(pipeline_str)

    # # get the sink
    # sink = pipeline.get_by_name('sink')

    # sink.set_property('emit-signals', True)
    # sink.connect('new-sample', on_new_sample, None)

    pipeline.set_state(Gst.State.PLAYING)
    # pipeline.get_bus().connect('message', on_message)

# def on_new_sample(sink, data):
#     sample = sink.emit('pull-sample')
#     buffer = sample.get_buffer()
#     image_data = buffer.extract_dup(0, buffer.get_size())
#     print("buffer size: %d" % len(image_data))
    
#     renderer.renderVideoFrame(image_data)

#     return Gst.FlowReturn.OK


stream.onPipeWireStreamAdded = on_pipewire_stream_added

faulthandler.enable()
remote_desktop_session.Start()

try:
    loop.run()
except KeyboardInterrupt:
    print("interrupted")
    terminate()
