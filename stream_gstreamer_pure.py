#!/usr/bin/env python3
"""
Reine GStreamer-basierte Version ohne VLC-Fallback
Optimiert für Raspberry Pi 5 mit Software-Dekodierung
"""
import sys
import gi
import requests
from PyQt5 import QtWidgets, QtCore
from PyQt5.QtCore import QMetaObject, Qt, pyqtSignal, QTimer
from PyQt5.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QFrame, QApplication

# GStreamer-Importe
gi.require_version('Gst', '1.0')
gi.require_version('GstVideo', '1.0')
from gi.repository import Gst, GstVideo, GObject

# GStreamer initialisieren
Gst.init(None)
GObject.threads_init()

class GStreamerPlayer(QWidget):
    """Reiner GStreamer-basierter RTSP Player"""
    
    error_occurred = pyqtSignal(str)
    
    def __init__(self, rtsp_url, show_buttons=True, stream_type="main", parent=None):
        super(GStreamerPlayer, self).__init__(parent)
        
        self.rtsp_url = rtsp_url
        self.show_buttons = show_buttons
        self.stream_type = stream_type
        self.is_playing = False
        
        # GStreamer-spezifische Variablen
        self.pipeline = None
        self.bus = None
        
        self.setWindowTitle(f"GStreamer Stream Player ({stream_type})")
        self.setCursor(Qt.BlankCursor)
        self.setStyleSheet("background-color: black; margin:-5px; border:1px solid black;")
        
        # Setup UI
        self.setup_ui()
        
        # Setup GStreamer
        self.setup_gstreamer()
        
        # Stream-Monitoring Timer
        self.monitor_timer = QTimer()
        self.monitor_timer.timeout.connect(self.check_stream_health)
        self.monitor_timer.start(5000)
        
        # Error-Signal verbinden
        self.error_occurred.connect(self.handle_error)
        
        # Timer für Exit-Überwachung (ESC-Taste Alternative)
        self.exit_timer = QTimer()
        self.exit_timer.timeout.connect(self.check_exit_conditions)
        self.exit_timer.start(500)  # Prüfe alle 500ms
        
    def setup_ui(self):
        """Setup der PyQt5 Benutzeroberfläche"""
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        
        # Video-Widget
        self.video_widget = QWidget(self)
        self.video_widget.setStyleSheet("background-color: black;")
        
        # Fokus für Keyboard-Events aktivieren
        self.setFocusPolicy(Qt.StrongFocus)
        self.video_widget.setFocusPolicy(Qt.StrongFocus)
        
        # Overlay-Widget für Mausklicks (transparent über Video)
        self.click_overlay = QWidget(self.video_widget)
        self.click_overlay.setStyleSheet("background-color: rgba(0,0,0,0);")  # Vollständig transparent
        self.click_overlay.mousePressEvent = self.handle_mouse_click
        self.click_overlay.setAttribute(Qt.WA_TransparentForMouseEvents, False)  # Mausklicks erlauben
        self.click_overlay.show()
        
        if self.show_buttons:
            # Video nimmt 75% der Breite, Buttons 25%
            button_container = self.create_button_container()
            
            # Alle Streams: Buttons links, Video rechts
            main_layout.addWidget(button_container, 1)
            main_layout.addWidget(self.video_widget, 3)
            
            # Video-Widget Skalierung für bessere Anpassung
            self.video_widget.setSizePolicy(QtWidgets.QSizePolicy.Expanding, QtWidgets.QSizePolicy.Expanding)
        else:
            main_layout.addWidget(self.video_widget, 10)
            
        self.video_widget.mousePressEvent = self.handle_mouse_click
            
    def create_button_container(self):
        """Erstelle Button-Container für Türöffner"""
        button_container = QWidget()
        button_layout = QVBoxLayout(button_container)
        button_layout.setContentsMargins(0, 0, 0, 0)
        button_layout.setSpacing(0)
        
        # Gartentor-Button
        gate_button = QPushButton("Gartentor öffnen")
        gate_button.clicked.connect(self.open_gate)
        gate_button.setStyleSheet("""
            QPushButton {
                background-color: lightgrey;
                border: 1px solid black;
                min-width: 200px;
                min-height: 300px;
                font-size: 16px;
            }
        """)
        gate_button.setSizePolicy(QtWidgets.QSizePolicy.Expanding, QtWidgets.QSizePolicy.Expanding)
        
        # Eingangstür-Button
        door_button = QPushButton("Eingangstüre öffnen")
        door_button.clicked.connect(self.open_door)
        door_button.setStyleSheet("""
            QPushButton {
                background-color: grey;
                border: 1px solid black;
                min-width: 200px;
                min-height: 300px;
                font-size: 16px;
            }
        """)
        door_button.setSizePolicy(QtWidgets.QSizePolicy.Expanding, QtWidgets.QSizePolicy.Expanding)
        
        button_layout.addWidget(gate_button)
        button_layout.addWidget(door_button)
        
        return button_container
    
    def setup_gstreamer(self):
        """Setup der optimierten GStreamer Pipeline"""
        try:
            # Optimierte Pipeline für Raspberry Pi 5 (Software-Dekodierung)
            # Verwende verschiedene Sinks je nach Anwendungsfall
            if self.show_buttons:
                # Mit Buttons: Verwende ximagesink mit besserer Skalierung
                sink = "ximagesink name=videosink sync=false force-aspect-ratio=false"
            else:
                # Ohne Buttons: Verwende ximagesink ohne Aspect-Ratio-Zwang für ganzes Bild
                sink = "ximagesink name=videosink sync=false force-aspect-ratio=false"
                
            # Spezielle Pipeline-Konfiguration je nach Layout
            if self.show_buttons:
                # Mit Buttons: Video-Skalierung für bessere Anpassung
                pipeline_str = f"""
                    rtspsrc location={self.rtsp_url} latency=100 protocols=tcp retry=3 timeout=5000000000 ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    rtph264depay ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    h264parse ! 
                    avdec_h264 ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    videoconvert ! 
                    videoscale method=lanczos ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    {sink}
                """
            else:
                # Ohne Buttons: Pipeline mit Videoskalierung für ganzes Bild
                pipeline_str = f"""
                    rtspsrc location={self.rtsp_url} latency=100 protocols=tcp retry=3 timeout=5000000000 ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    rtph264depay ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    h264parse ! 
                    avdec_h264 ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    videoconvert ! 
                    videoscale method=lanczos ! 
                    queue max-size-buffers=5 leaky=downstream ! 
                    {sink}
                """
            
            print(f"Erstelle optimierte GStreamer Pipeline für {self.stream_type}")
            print(f"RTSP URL: {self.rtsp_url}")
            print(f"Pipeline: {pipeline_str.strip()}")
            
            # Pipeline erstellen
            self.pipeline = Gst.parse_launch(pipeline_str.strip())
            
            if not self.pipeline:
                raise Exception("Konnte GStreamer Pipeline nicht erstellen")
            
            # Video-Sink konfigurieren
            videosink = self.pipeline.get_by_name('videosink')
            if videosink:
                try:
                    videosink.set_window_handle(self.video_widget.winId())
                    videosink.set_property('force-aspect-ratio', True)
                    print(f"Video-Sink erfolgreich konfiguriert für Widget-ID: {self.video_widget.winId()}")
                except Exception as e:
                    print(f"Warnung: Video-Sink-Konfiguration fehlgeschlagen: {e}")
                    print("Stream läuft ohne Widget-Embedding")
            
            # Bus-Handler für Nachrichten
            self.bus = self.pipeline.get_bus()
            self.bus.add_signal_watch()
            self.bus.connect("message", self.on_bus_message)
            
            print("GStreamer Pipeline erfolgreich erstellt")
            
        except Exception as e:
            print(f"Fehler beim Setup der GStreamer Pipeline: {e}")
            self.error_occurred.emit(f"Pipeline Setup Fehler: {e}")
    
    def on_bus_message(self, bus, message):
        """Handler für GStreamer Bus-Nachrichten"""
        msg_type = message.type
        
        if msg_type == Gst.MessageType.EOS:
            print("End of Stream erreicht")
            self.stop_stream()
            
        elif msg_type == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            error_msg = f"GStreamer Fehler: {err.message}"
            print(f"{error_msg} (Debug: {debug})")
            self.error_occurred.emit(error_msg)
            
        elif msg_type == Gst.MessageType.WARNING:
            warn, debug = message.parse_warning()
            print(f"GStreamer Warnung: {warn.message}")
            
        elif msg_type == Gst.MessageType.STATE_CHANGED:
            if message.src == self.pipeline:
                old_state, new_state, pending_state = message.parse_state_changed()
                print(f"Pipeline State: {old_state.value_name} -> {new_state.value_name}")
                
                if new_state == Gst.State.PLAYING:
                    self.is_playing = True
                elif new_state in [Gst.State.NULL, Gst.State.READY]:
                    self.is_playing = False
    
    def start_stream(self):
        """Starte den RTSP Stream"""
        if not self.pipeline:
            print("Keine Pipeline verfügbar")
            return False
            
        print(f"Starte GStreamer {self.stream_type} Stream...")
        
        # Pipeline auf PLAYING setzen
        ret = self.pipeline.set_state(Gst.State.PLAYING)
        
        if ret == Gst.StateChangeReturn.FAILURE:
            print("Konnte Pipeline nicht starten")
            return False
        
        # Vollbild aktivieren
        QMetaObject.invokeMethod(self, 'enter_fullscreen_mode', Qt.QueuedConnection)
        
        print(f"GStreamer {self.stream_type} Stream gestartet")
        return True
    
    def stop_stream(self):
        """Stoppe den RTSP Stream"""
        if self.pipeline:
            print(f"Stoppe GStreamer {self.stream_type} Stream...")
            self.pipeline.set_state(Gst.State.NULL)
            self.is_playing = False
    
    def restart_stream(self):
        """Stream neu starten"""
        print(f"Starte {self.stream_type} Stream neu...")
        self.stop_stream()
        QTimer.singleShot(1000, self.start_stream)
    
    def check_stream_health(self):
        """Prüfe Stream-Gesundheit"""
        if not self.pipeline:
            return
            
        ret, state, pending = self.pipeline.get_state(Gst.CLOCK_TIME_NONE)
        
        if ret == Gst.StateChangeReturn.FAILURE or state != Gst.State.PLAYING:
            print(f"{self.stream_type} Stream nicht aktiv - Neustart erforderlich")
            self.restart_stream()
    
    @QtCore.pyqtSlot()
    def enter_fullscreen_mode(self):
        """Vollbild-Modus aktivieren"""
        self.showFullScreen()
        self.raise_()
        self.activateWindow()
    
    def handle_mouse_click(self, event):
        """Handler für Mausklicks"""
        print(f"Mausklick erkannt in {self.stream_type} Stream")
        self.exit_stream()
    
    def keyPressEvent(self, event):
        """Handler für Tastatureingaben"""
        if event.key() == Qt.Key_Escape or event.key() == Qt.Key_Q or event.key() == Qt.Key_Space:
            print(f"Taste gedrückt: {event.key()} - Beende {self.stream_type} Stream")
            self.exit_stream()
        super().keyPressEvent(event)
    
    def check_exit_conditions(self):
        """Prüfe Exit-Bedingungen periodisch"""
        # Prüfe ob eine Exit-Datei erstellt wurde (für externe Steuerung)
        import os
        exit_file = f"/tmp/exit_stream_{self.stream_type}"
        if os.path.exists(exit_file):
            print(f"Exit-Datei gefunden: {exit_file}")
            os.remove(exit_file)
            self.exit_stream()
    
    def exit_stream(self):
        """Universelle Exit-Funktion"""
        print(f"{self.stream_type} Stream wird beendet...")
        self.stop_stream()
        QApplication.quit()
    
    def resizeEvent(self, event):
        """Handler für Größenänderungen - passt Overlay an"""
        super().resizeEvent(event)
        if hasattr(self, 'click_overlay') and hasattr(self, 'video_widget'):
            self.click_overlay.resize(self.video_widget.size())
            self.click_overlay.move(0, 0)
    
    def handle_error(self, error_msg):
        """Handler für Stream-Fehler"""
        print(f"{self.stream_type} Stream-Fehler: {error_msg}")
        QTimer.singleShot(2000, self.restart_stream)
    
    def open_gate(self):
        """Gartentor öffnen"""
        try:
            response = requests.get("http://192.168.1.2:8087/set/openknx.0.Verbraucher.Garten_Garage.Gartentüre(Schalten)?value=true")
            print(f"Gartentor geöffnet! Status code: {response.status_code}")
        except Exception as e:
            print(f"Fehler beim Öffnen des Gartentors: {e}")
    
    def open_door(self):
        """Eingangstür öffnen"""
        try:
            response = requests.get("http://192.168.1.2:8087/set/openknx.0.Verbraucher.Erdgeschoss.1_Vorraum-Türöffner(Schalten)?value=true")
            print(f"Eingangstür geöffnet! Status code: {response.status_code}")
        except Exception as e:
            print(f"Fehler beim Öffnen der Eingangstür: {e}")
    
    def closeEvent(self, event):
        """Cleanup beim Schließen"""
        print(f"Beende GStreamer {self.stream_type} Player...")
        self.monitor_timer.stop()
        self.stop_stream()
        
        if self.bus:
            self.bus.remove_signal_watch()
        
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
            self.pipeline = None
        
        event.accept()


class StreamApp(QApplication):
    """Hauptanwendung für GStreamer Stream"""
    
    def __init__(self, rtsp_url, show_buttons=True, stream_type="main"):
        super().__init__(sys.argv)
        
        self.player = GStreamerPlayer(rtsp_url, show_buttons, stream_type)
        QTimer.singleShot(500, self.player.start_stream)


def main():
    """Hauptfunktion für verschiedene Stream-Typen"""
    if len(sys.argv) > 1:
        stream_type = sys.argv[1]
    else:
        stream_type = "main"
    
    # Stream-Konfiguration basierend auf Typ
    if stream_type == "main":
        rtsp_url = 'rtsp://192.168.1.1:7447/3Zs8SwrImTV2rjNs'
        show_buttons = True
    elif stream_type == "front_yard":
        rtsp_url = 'rtsp://192.168.1.1:7447/UWlJ0sQ5GKc9Qygj'
        show_buttons = False
    elif stream_type == "front_yard_after_ring":
        rtsp_url = 'rtsp://192.168.1.1:7447/UWlJ0sQ5GKc9Qygj'
        show_buttons = True
    else:
        print(f"Unbekannter Stream-Typ: {stream_type}")
        sys.exit(1)
    
    print(f"Starte reinen GStreamer {stream_type} Stream...")
    app = StreamApp(rtsp_url, show_buttons, stream_type)
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
