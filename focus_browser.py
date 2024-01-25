import rpyc

# Verbinden Sie sich mit dem RPyC-Server
conn = rpyc.connect("localhost", 18861)

# Rufen Sie die Methode toggle_fullscreen auf
conn.root.toggle_fullscreen()

# Schließen Sie die Verbindung
conn.close()