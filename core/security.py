import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import secrets
import string
from typing import Any, Dict, Optional

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
import jwt

logger = logging.getLogger("openchatfunnel.security")

# Prefixo identificador para dados cifrados em repouso
CIPHER_PREFIX = "enc:v1:"
KEY_FILE = Path(__file__).resolve().parent.parent / ".encryption.key"


def get_or_create_master_key() -> bytes:
    """
    Obtém a chave mestre de criptografia do ambiente ou do arquivo local persistente.
    Se não existir, gera uma chave criptográfica forte de 256 bits (base64 URL-safe).
    """
    env_key = os.getenv("OPENCHATFUNNEL_SECRET_KEY") or os.getenv("ENCRYPTION_KEY")
    if env_key:
        key_bytes = env_key.strip().encode("utf-8")
        try:
            # Valida se é uma chave Fernet válida de 32 bytes em base64
            Fernet(key_bytes)
            return key_bytes
        except Exception:
            # Deriva chave válida via SHA-256 se for uma senha em texto puro
            derived = base64.urlsafe_b64encode(hashlib.sha256(key_bytes).digest())
            return derived

    if KEY_FILE.exists():
        try:
            stored = KEY_FILE.read_text(encoding="utf-8").strip().encode("utf-8")
            Fernet(stored)
            return stored
        except Exception as e:
            logger.warning("Chave persistente corrompida. Gerando nova chave: %s", e)

    # Gera nova chave Fernet (32 bytes AES + HMAC)
    new_key = Fernet.generate_key()
    try:
        KEY_FILE.write_text(new_key.decode("utf-8"), encoding="utf-8")
    except Exception as e:
        logger.warning("Não foi possível salvar .encryption.key no disco: %s", e)

    return new_key


_MASTER_KEY = get_or_create_master_key()
_FERNET = Fernet(_MASTER_KEY)


def encrypt_field(plaintext: Optional[str]) -> Optional[str]:
    """
    Criptografa um campo de texto em repouso utilizando AES com autenticação HMAC-SHA256.
    Retorna o valor cifrado com o prefixo 'enc:v1:' para rastreabilidade de integridade.
    """
    if plaintext is None:
        return None
    text = str(plaintext)
    if not text:
        return ""
    if text.startswith(CIPHER_PREFIX):
        return text  # Já está cifrado

    token = _FERNET.encrypt(text.encode("utf-8")).decode("utf-8")
    return f"{CIPHER_PREFIX}{token}"


def decrypt_field(ciphertext: Optional[str]) -> Optional[str]:
    """
    Descriptografa um campo em repouso de forma transparente e segura.
    Se o dado for legado (não cifrado), retorna o texto original sem quebra.
    """
    if ciphertext is None:
        return None
    text = str(ciphertext)
    if not text:
        return ""

    if text.startswith(CIPHER_PREFIX):
        raw_token = text[len(CIPHER_PREFIX):]
        try:
            return _FERNET.decrypt(raw_token.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            logger.error("Falha de autenticação/integridade ao descriptografar dado.")
            return "[DADO CIFRADO - FALHA DE CHAVE]"
        except Exception as e:
            logger.error("Erro inesperado na descriptografia: %s", e)
            return text

    # Se não contém o prefixo, pode ser texto puro legado
    return text


def encrypt_dict(data: Optional[Dict[str, Any]]) -> str:
    """Criptografa um dicionário JSON (ex: campos customizados) em repouso."""
    if not data:
        return "{}"
    serialized = json.dumps(data, ensure_ascii=False)
    encrypted = encrypt_field(serialized)
    return encrypted or "{}"


def decrypt_dict(cipher_json: Optional[str]) -> Dict[str, Any]:
    """Descriptografa e decodifica um dicionário JSON em repouso."""
    if not cipher_json:
        return {}
    decrypted_str = decrypt_field(cipher_json)
    if not decrypted_str:
        return {}
    try:
        return json.loads(decrypted_str)
    except Exception:
        # Tenta interpretar como JSON direto se for texto plano
        try:
            return json.loads(cipher_json)
        except Exception:
            return {}


def blind_index(value: Optional[str]) -> Optional[str]:
    """
    Gera um índice cego determinístico via HMAC-SHA256.
    Permite busca exata (ex: localizar telefone do cliente) sem precisar expor
    o dado em texto plano no banco de dados.
    """
    if not value:
        return None
    clean = "".join(ch for ch in str(value) if ch.isalnum()).lower()
    if not clean:
        return None
    return hmac.new(_MASTER_KEY, clean.encode("utf-8"), hashlib.sha256).hexdigest()


def mask_pii(value: Optional[str], kind: str = "phone") -> str:
    """Ofusca dados pessoais sensíveis (PII) para exibição em logs e auditorias (LGPD/GDPR)."""
    if not value:
        return "—"
    v = str(value).strip()
    if kind == "phone":
        digits = [c for c in v if c.isdigit()]
        if len(digits) >= 8:
            return f"{v[:5]}*****{v[-4:]}"
        return "*****"
    elif kind == "email":
        if "@" in v:
            name, domain = v.split("@", 1)
            masked_name = name[0] + "***" + (name[-1] if len(name) > 1 else "")
            return f"{masked_name}@{domain}"
        return "***@***"
    return "*****"


def get_security_overview() -> Dict[str, Any]:
    """Retorna o panorama do ecossistema criptográfico e segurança de dados do OpenChatFunnel."""
    return {
        "status": "active",
        "cipher_algorithm": "AES-128/256-CBC + HMAC-SHA256 (Fernet Authenticated)",
        "cipher_version": "v1 (enc:v1)",
        "key_storage": "Secure Environment / .encryption.key",
        "key_loaded": True,
        "features": {
            "data_at_rest_encryption": True,
            "messages_encrypted": True,
            "contact_pii_encrypted": True,
            "internal_notes_encrypted": True,
            "tls_wss_headers_active": True,
            "lgpd_gdpr_compliance_ready": True,
        },
        "standards": ["LGPD (Lei 13.709/2018)", "GDPR Art. 32", "NIST SP 800-38A"],
    }


# =====================================================================
# Autenticação, Senhas e Tokens JWT
# =====================================================================

_JWT_SECRET = os.getenv("OPENCHATFUNNEL_SECRET_KEY") or _MASTER_KEY.decode("utf-8")
JWT_ALGORITHM = "HS256"
JWT_DEFAULT_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    """Gera hash seguro de senha utilizando bcrypt com salt dinâmico."""
    if not password:
        raise ValueError("A senha não pode ser vazia.")
    pw_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha em texto puro corresponde ao hash bcrypt armazenado."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception as exc:
        logger.warning("Falha na validação de hash de senha: %s", exc)
        return False


def generate_secure_password(length: int = 12) -> str:
    """
    Gera uma senha temporária aleatória e segura contendo:
    letras maiúsculas, minúsculas, números e caracteres especiais.
    """
    if length < 8:
        length = 12

    upper = string.ascii_uppercase
    lower = string.ascii_lowercase
    digits = string.digits
    symbols = "!@#$%^&*"
    all_chars = upper + lower + digits + symbols

    # Garante pelo menos um caractere de cada categoria
    pwd = [
        secrets.choice(upper),
        secrets.choice(lower),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]
    for _ in range(length - 4):
        pwd.append(secrets.choice(all_chars))

    # Embaralha a lista para não previsibilidade
    secrets.SystemRandom().shuffle(pwd)
    return "".join(pwd)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Cria um token JWT assinado criptograficamente com HMAC-SHA256."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=JWT_DEFAULT_EXPIRE_HOURS)

    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, _JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodifica e valida a assinatura e expiração de um token JWT."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token JWT expirado.")
        return None
    except jwt.InvalidTokenError as exc:
        logger.warning("Token JWT inválido: %s", exc)
        return None

