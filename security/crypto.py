from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv
import os

load_dotenv()

key = os.getenv("ENCRYPTION_KEY").encode()
aesgcm = AESGCM(key)

def encrypt(text):
    iv = os.urandom(12)
    encrypted = aesgcm.encrypt(
        iv,
        text.encode("utf-8"),
        None
    )
    return {
        "iv": iv.hex(),
        "content": encrypted.hex()
    }

def decrypt(data):
    iv = bytes.fromhex(data["iv"])
    encrypted = bytes.fromhex(data["content"])
    decrypted = aesgcm.decrypt(
        iv,
        encrypted,
        None
    )
    return decrypted.decode("utf-8")
