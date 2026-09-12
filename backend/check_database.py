from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "users.db"

connection = sqlite3.connect(DB_PATH)

cursor = connection.cursor()

cursor.execute("SELECT * FROM users")

data = cursor.fetchall()

print(data)

connection.close()