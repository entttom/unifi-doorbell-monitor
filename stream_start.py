import rpyc

conn = rpyc.connect("localhost", 18812)
conn.root.reload()
conn.close()