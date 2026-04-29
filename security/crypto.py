from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

key = AESGCM.generate_key(bit_lenght=256)
aesgcm = AESGCM(key)

def encrypt(text):
    iv = os.urandom(12)
    data = text.encode("utf-8")
    encrypted = aesgcm.encrypt(iv, data, None)
    return
    {
        "iv": iv.hex(),
        "content": encrypted.hex()
    }

def decrypt(data):
    iv = bytes.fromhex(data["iv"])
    encrypted = bytes.fromhex(data["content"])
    decrypted = aesgcm.decrypt(iv, encrypted, None)
    return decrypted.decode("utf-8")

