#!/usr/bin/python3

import argparse
import logging
import sys
import signal
import pydbus
import gi
import time
import os
import threading
    
gi.require_version('Gst', '1.0')
from gi.repository import GLib, GObject, Gst

logger = logging.getLogger('breezy_ui')

# XDG Desktop Portal interfaces
portal_iface = 'org.freedesktop.portal.Desktop'
screencast_iface = 'org.freedesktop.portal.ScreenCast'
request_iface = 'org.freedesktop.portal.Request'

gst_pipeline_format = "pipewiresrc path=%u ! video/x-raw,max-framerate=%d/1,width=%d,height=%d ! fakesink sync=false"

class VirtualDisplay:
    def __init__(self, width, height, framerate, on_closed_cb):
        self.width = width
        self.height = height
        self.framerate = framerate
        self.on_closed_cb = on_closed_cb
        self.session_handle = None
        self.request_counter = 0
        self.pipeline = None
        self.stream = None
        self.bus = None
        self.portal = None
        self.screencast = None
        self.main_loop = None
        self.pending_requests = {}
        self.signal_subscription_id = None

        Gst.init(None)

    def _get_unique_request_path(self):
        """Generate a unique request path for portal requests"""
        self.request_counter += 1
        # Get unique name from the underlying GLib DBus connection
        unique_name = self.bus.con.get_unique_name()
        sender_name = unique_name.replace('.', '_').replace(':', '').replace('-', '_')
        return f"/org/freedesktop/portal/desktop/request/{sender_name}/request_{self.request_counter}"

    def _setup_global_signal_handler(self):
        """Set up a global signal handler for all portal requests"""
        try:
            def signal_handler(connection, sender_name, object_path, interface_name, signal_name, parameters, user_data):
                logger.info(f"D-Bus signal: {signal_name} from {object_path}")
                logger.info(f"Signal parameters: {parameters}")
                
                if signal_name == 'Response':
                    # Find matching callback by checking if object_path matches any pending request
                    matching_callback = None
                    matching_key = None
                    
                    for request_path, callback in self.pending_requests.items():
                        # The signal path might be slightly different from request path
                        # Extract the base path (everything before the last part)
                        request_base = '/'.join(request_path.split('/')[:-1])
                        signal_base = '/'.join(object_path.split('/')[:-1])
                        
                        if request_base == signal_base:
                            matching_callback = callback
                            matching_key = request_path
                            break
                    
                    if matching_callback:
                        if parameters and len(parameters) >= 2:
                            response = parameters[0]
                            results = parameters[1]
                            logger.info(f"Calling callback for {matching_key} with response={response}")
                            matching_callback(response, results)
                        del self.pending_requests[matching_key]
                    else:
                        logger.warning(f"No matching callback found for signal from {object_path}")

            # Subscribe to all Response signals from portal Request objects
            self.signal_subscription_id = self.bus.con.signal_subscribe(
                sender=None,
                interface_name='org.freedesktop.portal.Request',
                member='Response',
                object_path=None,  # Listen to all request paths
                arg0=None,
                flags=0,
                callback=signal_handler,
                user_data=None
            )
            
            logger.info(f"Set up global signal handler with ID: {self.signal_subscription_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to setup global signal handler: {e}")
            return False

    def _setup_request_handler(self, request_path, callback):
        """Set up a request handler for portal async operations"""
        try:
            # Store the callback - it will be called by the global signal handler
            self.pending_requests[request_path] = callback
            logger.info(f"Registered callback for request: {request_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to setup request handler for {request_path}: {e}")
            return False

    def _create_session(self):
        """Create a screencast session using XDG portal"""
        try:
            self.bus = pydbus.SessionBus()
            self.portal = self.bus.get('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop')
            
            # Get the specific ScreenCast interface
            self.screencast = self.portal['org.freedesktop.portal.ScreenCast']
            
            # Set up global signal handler for all requests
            if not self._setup_global_signal_handler():
                raise Exception("Failed to setup signal handler")
            
            # Test basic connectivity
            logger.info("Testing portal connectivity...")
            try:
                # Access the version property directly
                version = self.screencast.version
                logger.info(f"ScreenCast portal version: {version}")
            except Exception as e:
                logger.warning(f"Could not get ScreenCast version: {e}")
                # This is not critical, continue anyway
            
        except Exception as e:
            logger.error(f"Failed to connect to XDG Desktop Portal: {e}")
            self.terminate()
            return

        # Create session request
        request_path = self._get_unique_request_path()
        logger.info(f"Creating session request at: {request_path}")
        
        # Set up the request handler first
        if not self._setup_request_handler(request_path, self._on_create_session_response):
            self.terminate()
            return
        
        # Options for CreateSession
        options = {
            'handle_token': GLib.Variant('s', f'session_{self.request_counter}'),
            'session_handle_token': GLib.Variant('s', f'session_{self.request_counter}')
        }
        
        try:
            # Create the session using the specific interface
            response = self.screencast.CreateSession(options)
            logger.info(f"CreateSession returned: {response}")
            
        except Exception as e:
            logger.error(f"Failed to call CreateSession: {e}")
            self.terminate()

    def _on_create_session_response(self, response, results):
        """Handle CreateSession response"""
        logger.info(f"CreateSession response: {response}, results: {results}")
        
        if response != 0:
            logger.error(f"Failed to create session, response code: {response}")
            self.terminate()
            return
            
        self.session_handle = results.get('session_handle')
        if not self.session_handle:
            logger.error("No session handle in CreateSession response")
            self.terminate()
            return
            
        logger.info(f"Session created successfully: {self.session_handle}")
        
        # Now select sources
        GLib.idle_add(self._select_sources)

    def _select_sources(self):
        """Select sources for recording"""
        if not self.session_handle:
            logger.error("No session handle available for SelectSources")
            self.terminate()
            return False
            
        request_path = self._get_unique_request_path()
        logger.info(f"Creating SelectSources request at: {request_path}")
        
        # Set up the request handler
        if not self._setup_request_handler(request_path, self._on_select_sources_response):
            self.terminate()
            return False
        
        # Options for SelectSources - try to create a virtual output
        options = {
            'handle_token': GLib.Variant('s', f'sources_{self.request_counter}'),
            'types': GLib.Variant('u', 1 | 2 | 4)  # VIRTUAL = 4
        }
        
        try:
            # SelectSources is asynchronous and should return a request path
            request_handle = self.screencast.SelectSources(self.session_handle, options)
            logger.info(f"SelectSources returned request handle: {request_handle}")
            
        except Exception as e:
            logger.error(f"Failed to call SelectSources: {e}")
            self.terminate()
            
        return False  # Don't repeat this idle callback

    def _on_select_sources_response(self, response, results):
        """Handle SelectSources response"""
        logger.info(f"SelectSources response: {response}, results: {results}")
        
        if response != 0:
            logger.error(f"Failed to select sources, response code: {response}")
            # If virtual sources aren't supported, we might need to fall back
            if response == 2:  # User cancelled or not supported
                logger.error("Virtual sources may not be supported by this portal implementation")
            self.terminate()
            return
            
        logger.info("Sources selected successfully")
        
        # Now start the recording
        GLib.idle_add(self._start_recording)

    def _start_recording(self):
        """Start the recording"""
        if not self.session_handle:
            logger.error("No session handle available for Start")
            self.terminate()
            return False
            
        request_path = self._get_unique_request_path()
        logger.info(f"Creating Start request at: {request_path}")
        
        # Set up the request handler
        if not self._setup_request_handler(request_path, self._on_start_response):
            self.terminate()
            return False
        
        # Options for Start
        options = {
            'handle_token': GLib.Variant('s', f'start_{self.request_counter}'),
        }
        
        try:
            # Start is asynchronous and should return a request path
            request_handle = self.screencast.Start(self.session_handle, '', options)
            logger.info(f"Start returned request handle: {request_handle}")
            
        except Exception as e:
            logger.error(f"Failed to call Start: {e}")
            self.terminate()
            
        return False  # Don't repeat this idle callback

    def _on_start_response(self, response, results):
        """Handle Start response"""
        logger.info(f"Start response: {response}, results: {results}")
        
        if response != 0:
            logger.error(f"Failed to start recording, response code: {response}")
            self.terminate()
            return
            
        # Get streams information
        streams = results.get('streams', [])
        if not streams:
            logger.error("No streams available in Start response")
            self.terminate()
            return
            
        logger.info(f"Recording started with {len(streams)} stream(s)")
        
        # Use the first stream
        stream_info = streams[0]
        node_id = stream_info[0]  # PipeWire node ID
        properties = stream_info[1] if len(stream_info) > 1 else {}

        logger.info(f"Stream node ID: {node_id}, properties: {properties}")

        # Use the actual size from properties if available
        width = self.width
        height = self.height
        if 'size' in properties:
            width, height = properties['size']

        # Start the GStreamer pipeline
        GLib.idle_add(self._start_pipeline, node_id, width, height)

    def _start_pipeline(self, node_id, width, height):
        """Start the GStreamer pipeline with the given PipeWire node ID"""
        try:
            pipeline_str = gst_pipeline_format % (node_id, self.framerate, width, height)
            logger.info(f"Creating pipeline: {pipeline_str}")
            
            self.pipeline = Gst.parse_launch(pipeline_str)
            self.pipeline.get_bus().connect('message', self._on_message)
            
            # Start pipeline
            ret = self.pipeline.set_state(Gst.State.PLAYING)
            if ret == Gst.StateChangeReturn.FAILURE:
                logger.error("Failed to start pipeline")
                self.terminate()
            else:
                logger.info("Pipeline started successfully")
                
        except Exception as e:
            logger.error(f"Failed to create pipeline: {e}")
            self.terminate()
            
        return False  # Don't repeat this idle callback

    def create(self):
        """Create and start the virtual display with main loop"""
        try:
            # Start the main loop in a separate thread
            self.main_loop = GLib.MainLoop()
            
            def run_main_loop():
                logger.info("Starting GLib main loop")
                self.main_loop.run()
                logger.info("GLib main loop finished")
            
            self.loop_thread = threading.Thread(target=run_main_loop, daemon=True)
            self.loop_thread.start()
            
            # Give the loop time to start
            time.sleep(0.1)
            
            # Schedule the session creation
            GLib.idle_add(self._create_session)
            
        except Exception as e:
            logger.error(f"Failed to create virtual display: {e}")
            self.terminate()

    def terminate(self):
        """Clean up resources"""
        logger.info("Terminating virtual display")
        
        try:
            # Stop GStreamer pipeline
            if self.pipeline is not None:
                self.pipeline.send_event(Gst.Event.new_eos())
                self.pipeline.set_state(Gst.State.NULL)
                self.pipeline = None
        except Exception as e:
            logger.error(f"Failed to stop pipeline: {e}")

        try:
            # Close portal session
            if self.session_handle and hasattr(self, 'screencast') and self.screencast:
                self.screencast.CloseSession(self.session_handle)
                self.session_handle = None
        except Exception as e:
            logger.error(f"Failed to close session: {e}")

        # Clean up pending requests
        self.pending_requests.clear()

        # Unsubscribe from D-Bus signals
        if self.signal_subscription_id and hasattr(self, 'bus') and self.bus:
            try:
                self.bus.con.signal_unsubscribe(self.signal_subscription_id)
                self.signal_subscription_id = None
            except Exception as e:
                logger.error(f"Failed to unsubscribe from signals: {e}")

        # Stop the main loop
        if self.main_loop and self.main_loop.is_running():
            self.main_loop.quit()

        # Call the callback
        if self.on_closed_cb:
            try:
                self.on_closed_cb()
            except Exception as e:
                logger.error(f"Error in close callback: {e}")

    def _on_message(self, bus, message):
        """Handle GStreamer messages"""
        msg_type = message.type
        logger.info(f"GStreamer message type: {msg_type}")
        
        if msg_type == Gst.MessageType.EOS:
            logger.info("End of stream")
            self.pipeline = None
            self.terminate()
        elif msg_type == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            logger.error(f"GStreamer Error: {err}")
            logger.error(f"Debug info: {debug}")
            self.terminate()
        elif msg_type == Gst.MessageType.WARNING:
            warn, debug = message.parse_warning()
            logger.warning(f"GStreamer Warning: {warn}")
            logger.warning(f"Debug info: {debug}")

def is_screencast_available():
    """Check if XDG screencast portal is available"""
    try:
        bus = pydbus.SessionBus()
        
        # First check if the portal service is available
        try:
            portal = bus.get('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop')
        except Exception as e:
            logger.warning(f"XDG Desktop Portal service not available: {e}")
            logger.info("You may need to install and start xdg-desktop-portal and a backend like:")
            logger.info("  - xdg-desktop-portal-gtk (for GNOME/GTK)")
            logger.info("  - xdg-desktop-portal-kde (for KDE)")
            return False
        
        # Check if ScreenCast interface is available
        try:
            # Access the version property using pydbus interface access
            screencast_interface = portal['org.freedesktop.portal.ScreenCast']
            version = screencast_interface.version
            logger.info(f"ScreenCast portal version: {version}")
        except Exception as e:
            logger.warning(f"ScreenCast interface not available: {e}")
            return False
            
    except Exception as e:
        logger.warning(f"Failed to connect to session bus: {e}")
        return False
    
    try:
        Gst.init(None)
        element = Gst.ElementFactory.make("pipewiresrc", "test-pipewire")
        if element is None:
            logger.warning("pipewiresrc GStreamer element not available")
            return False
    except Exception as e:
        logger.warning(f"Failed to check pipewiresrc element: {e}")
        return False
        
    return True