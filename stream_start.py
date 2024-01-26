import rpyc

conn = rpyc.connect("localhost", 18812)
conn.root.start_streaming()
conn.close()