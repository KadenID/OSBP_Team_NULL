import bcrypt

def hash_password(password):
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed

def compare_password(password, hashed):
    password_bytes = password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed)
