from security.storage import save_user, load_user

save_user(
    "20201234",
    "my_password"
)

student_id, password = load_user()

print(student_id)
print(password)