import os
import sys
import subprocess
import atexit
import uvicorn
from api.routes import create_app

app = create_app()

bridge_proc = None

def start_whatsapp_bridge():
    global bridge_proc
    bridge_script = os.path.join(os.path.dirname(__file__), "whatsapp_bridge", "server.js")
    if os.path.exists(bridge_script):
        try:
            print("🚀 Iniciando WhatsApp Native Bridge (Baileys) na porta 8080...")
            bridge_proc = subprocess.Popen(
                ["node", bridge_script],
            )
            def cleanup():
                if bridge_proc and bridge_proc.poll() is None:
                    try:
                        bridge_proc.terminate()
                    except Exception:
                        pass
            atexit.register(cleanup)
        except Exception as e:
            print(f"⚠️ Aviso: Não foi possível iniciar WhatsApp Bridge automaticamente: {e}")

if __name__ == "__main__":
    start_whatsapp_bridge()
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host=host, port=port, reload=False)
