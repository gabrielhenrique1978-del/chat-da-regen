import os
import sys
import subprocess
import atexit
import uvicorn
from api.routes import create_app

app = create_app()

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

bridge_proc = None

def start_whatsapp_bridge():
    global bridge_proc
    bridge_dir = os.path.join(os.path.dirname(__file__), "whatsapp_bridge")
    bridge_script = os.path.join(bridge_dir, "server.js")
    if os.path.exists(bridge_script):
        try:
            # Encerra qualquer processo Node antigo preso na porta 8080 antes de subir a versão atual
            if sys.platform == "win32":
                subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        "Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }",
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            print("[Baileys Bridge] Iniciando servico de conexao na porta 8080...")
            bridge_proc = subprocess.Popen(
                ["node", "server.js"],
                cwd=bridge_dir,
            )
            def cleanup():
                if bridge_proc and bridge_proc.poll() is None:
                    try:
                        bridge_proc.terminate()
                    except Exception:
                        pass
            atexit.register(cleanup)
        except Exception as e:
            print(f"[Aviso] Nao foi possivel iniciar WhatsApp Bridge: {e}")

if __name__ == "__main__":
    start_whatsapp_bridge()
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host=host, port=port, reload=False)
