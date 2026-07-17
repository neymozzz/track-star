import threading
import webbrowser
import time

# Import the Flask app instance from the backend package
# backend.app defines `app` (Flask instance) and resolves static files using sys._MEIPASS
from backend.app import app as flask_app

def run_server():
    # Bind to localhost so the EXE doesn't expose the server on the network by default
    flask_app.run(host='127.0.0.1', port=5000, debug=False)

if __name__ == "__main__":
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    # wait a moment for the server to start
    time.sleep(1.0)
    webbrowser.open("http://127.0.0.1:5000/")
    # keep the main thread alive while the server thread runs
    try:
        t.join()
    except KeyboardInterrupt:
        pass
