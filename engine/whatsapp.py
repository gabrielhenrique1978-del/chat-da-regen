import base64
import json
import logging
import os
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger("openchatfunnel.whatsapp")


class WhatsAppService:
    """
    Serviço de integração com WhatsApp real via Evolution API (Baileys / Meta).
    Gerencia instâncias, leitura de QR Code, envio de mensagens de texto,
    áudios gravados (PTT) e webhooks de eventos de mensagens reais.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        instance_name: Optional[str] = None,
    ):
        resolved_url = base_url or os.getenv("EVOLUTION_API_URL", "http://localhost:8080")
        self.base_url = resolved_url.rstrip("/")
        self.api_key = api_key or os.getenv("EVOLUTION_API_KEY", "OPENCHATFUNNEL_SECRET_KEY_2026")
        self.instance_name = instance_name or os.getenv("EVOLUTION_INSTANCE_NAME", "openchatfunnel")
        self._connected = False
        self._phone_number: Optional[str] = None
        self._last_qrcode: Optional[str] = None

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "apikey": self.api_key,
            "Content-Type": "application/json",
        }

    async def get_connection_status(self) -> Dict[str, Any]:
        """Consulta o status real da instância na Evolution API."""
        url = f"{self.base_url}/instance/connectionState/{self.instance_name}"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, headers=self.headers)
                if res.status_code == 200:
                    data = res.json()
                    state = data.get("instance", {}).get("state", "disconnected")
                    self._connected = state == "open"
                    return {
                        "online": True,
                        "instance": self.instance_name,
                        "state": state,
                        "connected": self._connected,
                        "phone": self._phone_number,
                        "qrcode": self._last_qrcode if not self._connected else None,
                        "provider": "Evolution API v2",
                    }
        except Exception:
            pass

        return {
            "online": False,
            "instance": self.instance_name,
            "state": "offline" if not self._connected else "open",
            "connected": self._connected,
            "phone": self._phone_number,
            "qrcode": self._last_qrcode,
            "provider": "Evolution API (Local/Docker)",
            "message": "Servidor Evolution API não detectado na porta 8080. Inicie com 'docker-compose up -d' ou configure a URL da nuvem.",
        }

    async def create_or_connect(self) -> Dict[str, Any]:
        """Cria a instância se não existir e solicita o QR Code para leitura no celular."""
        # 1. Tenta verificar se a instância já existe
        status = await self.get_connection_status()
        if status.get("connected"):
            return {
                "success": True,
                "state": "open",
                "connected": True,
                "message": "WhatsApp já está conectado!",
            }

        create_url = f"{self.base_url}/instance/create"
        connect_url = f"{self.base_url}/instance/connect/{self.instance_name}"

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Cria instância caso não exista
                create_payload = {
                    "instanceName": self.instance_name,
                    "token": self.api_key,
                    "qrcode": True,
                    "integration": "WHATSAPP-BAILEYS",
                }
                await client.post(create_url, headers=self.headers, json=create_payload)

                # Solicita o QR Code de conexão
                res = await client.get(connect_url, headers=self.headers)
                if res.status_code in (200, 201):
                    data = res.json()
                    qr_base64 = data.get("base64") or data.get("code")
                    if qr_base64:
                        self._last_qrcode = qr_base64
                    return {
                        "success": True,
                        "instance": self.instance_name,
                        "state": "connecting",
                        "qrcode": qr_base64,
                        "pairingCode": data.get("pairingCode"),
                        "message": "Escaneie o QR Code no seu WhatsApp (Aparelhos Conectados).",
                    }
        except Exception as exc:
            logger.warning(f"Evolution API offline: {exc}")

        # Fallback de demonstração quando Docker não estiver rodando no momento
        return {
            "success": False,
            "instance": self.instance_name,
            "state": "docker_offline",
            "qrcode": None,
            "message": "Evolution API não encontrada em http://localhost:8080. Inicie o Docker com: docker-compose up -d",
        }

    async def disconnect(self) -> Dict[str, Any]:
        """Desconecta a sessão do WhatsApp."""
        logout_url = f"{self.base_url}/instance/logout/{self.instance_name}"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                await client.delete(logout_url, headers=self.headers)
        except Exception:
            pass

        self._connected = False
        self._last_qrcode = None
        self._phone_number = None
        return {"success": True, "state": "disconnected"}

    async def send_text_message(self, phone: str, text: str) -> Dict[str, Any]:
        """Envia mensagem de texto real para o número de WhatsApp via Evolution API."""
        clean_phone = "".join(ch for ch in phone if ch.isdigit())
        if not clean_phone:
            return {"success": False, "error": "Número de telefone inválido."}

        url = f"{self.base_url}/message/sendText/{self.instance_name}"
        payload = {
            "number": clean_phone,
            "options": {"delay": 1200, "presence": "composing", "linkPreview": True},
            "text": text,
        }

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.post(url, headers=self.headers, json=payload)
                if res.status_code in (200, 201):
                    return {"success": True, "result": res.json()}
        except Exception as exc:
            logger.warning(f"Falha ao enviar mensagem WhatsApp via Evolution API: {exc}")

        return {
            "success": False,
            "fallback": True,
            "message": "Mensagem salva no CRM (WhatsApp real offline ou simulado).",
        }

    async def send_audio_message(self, phone: str, audio_base64: str) -> Dict[str, Any]:
        """Envia áudio como nota de voz humana oficial (PTT - Push to Talk)."""
        clean_phone = "".join(ch for ch in phone if ch.isdigit())
        if not clean_phone:
            return {"success": False, "error": "Número de telefone inválido."}

        # Remove prefixo data:audio/...;base64, se presente
        if "," in audio_base64:
            audio_base64 = audio_base64.split(",", 1)[1]

        url = f"{self.base_url}/message/sendWhatsAppAudio/{self.instance_name}"
        payload = {
            "number": clean_phone,
            "options": {"delay": 1500, "presence": "recording"},
            "audio": audio_base64,
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(url, headers=self.headers, json=payload)
                if res.status_code in (200, 201):
                    return {"success": True, "result": res.json()}
        except Exception as exc:
            logger.warning(f"Falha ao enviar áudio PTT via Evolution API: {exc}")

        return {
            "success": False,
            "fallback": True,
            "message": "Áudio salvo no CRM como nota de voz.",
        }

    def set_connection_state_from_webhook(self, state: str, phone: Optional[str] = None):
        """Atualiza estado interno com base nos eventos de webhook."""
        self._connected = state.lower() == "open"
        if phone:
            self._phone_number = phone
