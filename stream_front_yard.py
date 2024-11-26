import sys
import vlc
import requests
from PyQt5 import QtWidgets, QtCore
import rpyc
from rpyc.utils.server import ThreadedServer
import threading
from PyQt5.QtCore import QMetaObject, Qt


class VLCPlayer(QtWidgets.QMainWindow):
    def __init__(self, master=None):
        super(VLCPlayer, self).__init__(master)
        self.setWindowTitle("VLC RTSP Stream")

        # Bildschirmabmessungen ermitteln
        screen = app.primaryScreen().size()
        screen_width = screen.width()
        screen_height = screen.height()

        self.setCursor(Qt.BlankCursor)

        # Erstellen Sie eine zentrale Widget
        self.central_widget = QtWidgets.QWidget(self)
        self.setCentralWidget(self.central_widget)
        self.central_widget.mousePressEvent = self.handle_mouse_click

        # Erstellen Sie ein Layout für das zentrale Widget
        self.layout = QtWidgets.QHBoxLayout(self.central_widget)

        # Erstellen Sie ein Frame für den VLC-Player
        self.vlc_frame = QtWidgets.QFrame(self.central_widget)
        self.setStyleSheet("background-color: black; margin:-5px; border:1px solid black; ")

        self.layout.addWidget(self.vlc_frame, 10)  # 100% der Breite


        # VLC-Player-Instanz erstellen
        self.vlc_instance = vlc.Instance('')
        self.player = self.vlc_instance.media_player_new()

        # RTSP-Stream zum VLC-Player hinzufügen
        self.rtsp_url = 'rtsp://192.168.1.1:7447/UWlJ0sQ5GKc9Qygj'
        self.media = self.vlc_instance.media_new(self.rtsp_url)
        self.media.get_mrl()
        self.player.set_media(self.media)
        self.player.video_set_scale(1.0)
        self.player.play()
        
        # Embed the VLC player into the PyQt frame
        if sys.platform.startswith('linux'):  # for Linux using the X Server
            self.player.set_xwindow(int(self.vlc_frame.winId()))
            #self.player.set_time(1000000)  # Verzögerung in Mikrosekunden (1 Sekunde)
            #self.player.set_time(3000000)  # Begrenzung in Mikrosekunden (3 Sekunden)
 
        elif sys.platform == "win32":  # for Windows
            self.player.set_hwnd(self.vlc_frame.winId())
        elif sys.platform == "darwin":  # for MacOS
            self.player.set_nsobject(int(self.vlc_frame.winId()))

    def handle_mouse_click(self, event):
        # Sende HTTP GET-Request beim Mausklick
        try:
            response = requests.get("http://127.0.0.1/api/kill_stream_window")
            print(f"HTTP GET-Request sent. Status code: {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"Error sending request: {e}")

    def start_stream(self):
        QMetaObject.invokeMethod(self, 'enterFullScreenMode', Qt.QueuedConnection)
        # Play the VLC player stream
        self.player.play()
        
      
        
    @QtCore.pyqtSlot()
    def enterFullScreenMode(self):
        # Switch to full screen mode
        self.showFullScreen()
        
        # Bring the window to the front
        self.raise_()
        self.activateWindow()  

    def stop_stream(self):
        self.player.stop()

    def open_gate(self):
        try:
            response = requests.get("http://192.168.1.2:8087/set/openknx.0.Verbraucher.Garten_Garage.Gartentüre(Schalten)?value=true")
            print(f"Gate opened! Status code: {response.status_code}")
        except Exception as e:
            print(f"Error opening gate: {e}")

    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()

class StreamingService(rpyc.Service):
    def on_connect(self, conn):
        pass

    def on_disconnect(self, conn):
        pass

    def exposed_start_streaming(self):
        app.player.start_stream()

    def exposed_stop_streaming(self):
        app.player.stop_stream()    

if __name__ == "__main__":
    app = QtWidgets.QApplication(sys.argv)
    player = VLCPlayer()
    app.player = player  # Referenz für den RPyC-Service
    player.toggle_fullscreen()  # Startet das Fenster im Vollbildmodus

    # RPyC-Server
    #t = ThreadedServer(StreamingService, port=18812, protocol_config={'allow_public_attrs': True})
    #server_thread = threading.Thread(target=t.start)
    #server_thread.daemon = True
    #server_thread.start()

    sys.exit(app.exec_())
