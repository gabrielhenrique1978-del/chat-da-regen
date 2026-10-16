import asyncio
import threading
from typing import Any, Awaitable, Callable, Dict, List, Optional


class MessageDebouncer:
    """
    Buffer anti-fragmentação de mensagens.
    Agrupa mensagens enviadas em sequência rápida pelo mesmo contato dentro de uma
    janela temporal configurável (padrão: 2.0 segundos) em um único disparo consolidado.
    """

    def __init__(
        self,
        window_seconds: float = 2.0,
        callback: Optional[Callable[[str, str, Dict[str, Any]], Any]] = None,
        separator: str = " ",
    ):
        self.window_seconds = window_seconds
        self.callback = callback
        self.separator = separator
        self._buffers: Dict[str, List[str]] = {}
        self._metadata: Dict[str, Dict[str, Any]] = {}
        self._timers: Dict[str, asyncio.Task] = {}
        self._sync_timers: Dict[str, threading.Timer] = {}
        self._lock = threading.Lock()

    def push(
        self,
        contact_id: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        Adiciona uma mensagem fragmentada ao buffer do contato e reinicia o temporizador.
        Retorna a quantidade atual de fragmentos acumulados para o contato.
        """
        text = content.strip()
        if not text:
            return len(self._buffers.get(contact_id, []))

        with self._lock:
            if contact_id not in self._buffers:
                self._buffers[contact_id] = []
            self._buffers[contact_id].append(text)
            if metadata:
                self._metadata[contact_id] = {
                    **self._metadata.get(contact_id, {}),
                    **metadata,
                }
            count = len(self._buffers[contact_id])

        # Agenda disparo assíncrono se houver event loop ativo, caso contrário usa threading.Timer
        try:
            loop = asyncio.get_running_loop()
            if contact_id in self._timers and not self._timers[contact_id].done():
                self._timers[contact_id].cancel()
            self._timers[contact_id] = loop.create_task(self._async_wait_and_flush(contact_id))
        except RuntimeError:
            with self._lock:
                if contact_id in self._sync_timers:
                    self._sync_timers[contact_id].cancel()
                timer = threading.Timer(self.window_seconds, self.flush_sync, args=(contact_id,))
                timer.daemon = True
                self._sync_timers[contact_id] = timer
                timer.start()

        return count

    async def _async_wait_and_flush(self, contact_id: str) -> Optional[str]:
        try:
            await asyncio.sleep(self.window_seconds)
            return await self.flush_async(contact_id)
        except asyncio.CancelledError:
            return None

    def _pop_buffer(self, contact_id: str) -> tuple[Optional[str], Dict[str, Any], int]:
        with self._lock:
            if contact_id in self._sync_timers:
                self._sync_timers.pop(contact_id).cancel()
            fragments = self._buffers.pop(contact_id, [])
            meta = self._metadata.pop(contact_id, {})
            if not fragments:
                return None, {}, 0
            combined = self.separator.join(fragments)
            meta["fragment_count"] = len(fragments)
            meta["fragments"] = fragments
            return combined, meta, len(fragments)

    def flush_sync(self, contact_id: str) -> Optional[str]:
        """Despacha imediatamente o buffer acumulado do contato de forma síncrona."""
        combined, meta, _ = self._pop_buffer(contact_id)
        if combined is None:
            return None
        if self.callback:
            result = self.callback(contact_id, combined, meta)
            if asyncio.iscoroutine(result):
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(result)
                except RuntimeError:
                    asyncio.run(result)
        return combined

    async def flush_async(self, contact_id: str) -> Optional[str]:
        """Despacha imediatamente o buffer acumulado do contato de forma assíncrona."""
        combined, meta, _ = self._pop_buffer(contact_id)
        if combined is None:
            return None
        if self.callback:
            result = self.callback(contact_id, combined, meta)
            if asyncio.iscoroutine(result) or isinstance(result, Awaitable):
                await result
        return combined

    def pending_fragments(self, contact_id: str) -> List[str]:
        with self._lock:
            return list(self._buffers.get(contact_id, []))
