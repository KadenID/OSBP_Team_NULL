mkdir -p backend/utils
touch backend/utils/crypto.py
touch backend/utils/password.py
mkdir docs
touch docs/security.md

from crypto import encrypt, decrypt
from password import hash_password, compare_password

data = encrypt("test")
print(decrypt(data))

