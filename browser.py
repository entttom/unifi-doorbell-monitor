import sys
from PyQt5.QtCore import QTimer
from PyQt5.QtWidgets import QApplication, QMainWindow
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtCore import QUrl # Importieren Sie QUrl


class BrowserWindow(QMainWindow):
    def __init__(self, url):
        super().__init__()
        self.browser = QWebEngineView()
        self.browser.setUrl(QUrl(url))  # Konvertieren Sie den String in ein QUrl-Objekt
        self.setCentralWidget(self.browser)
        self.showFullScreen()  # Startet im echten Vollbildmodus
        self.start_timer()


    def start_timer(self):
        # Setzt einen Timer, um die Seite alle 60 Minuten neu zu laden
        self.timer = QTimer()
        self.timer.setInterval(60 * 60 * 1000)  # 60 Minuten in Millisekunden
        self.timer.timeout.connect(self.reload_page)
        self.timer.start()

    def reload_page(self):
        # Lädt die aktuelle Seite im Browser neu
        self.browser.reload()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    browser_window = BrowserWindow("http://192.168.1.48")  # Setzen Sie hier die gewünschte URL ein
    sys.exit(app.exec_())