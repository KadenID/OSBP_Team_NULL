from crypto import encrypt, decrypt
from password import hash_password, compare_password

data = encrypt("test")
print(data)
print(decrypt(data))

pw = hash_password("1234")
print(pw)
print(compare_password("1234", pw))

