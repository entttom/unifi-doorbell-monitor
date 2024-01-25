import rpyc

conn = rpyc.connect("localhost", 18812)
conn.root.stop_streaming()
conn.close()