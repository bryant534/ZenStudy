from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "users.db"

connection = sqlite3.connect(DB_PATH)
cursor = connection.cursor()


def column_exists(table, column):
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def add_column_if_missing(table, column_def):
    column_name = column_def.split()[0]
    if not column_exists(table, column_name):
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
        print(f"+ column '{column_name}' added to {table}")


# ---------- Users table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    username TEXT,
    password TEXT
)
""")
add_column_if_missing("users", "bio TEXT DEFAULT ''")

# ---------- Calendar/schedule table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS calendar_events(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    event_date DATE,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")
add_column_if_missing("calendar_events", "event_time TEXT")

# ---------- COMPLETED study sessions table (for streaks & statistics) ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS study_sessions(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    study_date DATE DEFAULT CURRENT_DATE,
    duration_minutes INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")
add_column_if_missing("study_sessions", "topic TEXT")
add_column_if_missing("study_sessions", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

# ---------- Table for sessions CURRENTLY IN PROGRESS (for the "Currently Studying" home widget) ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS active_sessions(
    user_id INTEGER PRIMARY KEY,
    topic TEXT,
    started_at TIMESTAMP,
    planned_minutes INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")

# ---------- Posts table (Feed, Instagram-style) ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS posts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS post_likes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS post_comments(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")

# ---------- Global chat table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS chat_messages(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")

# ---------- Monthly challenge table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS challenges(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    topic TEXT NOT NULL,
    question_count INTEGER NOT NULL DEFAULT 5
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS challenge_attempts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    challenge_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(challenge_id) REFERENCES challenges(id)
)
""")

# Seed 3 default challenges for this month if none exist yet
from datetime import date as _date
current_month_key = _date.today().strftime("%Y-%m")
cursor.execute("SELECT COUNT(*) FROM challenges WHERE month_key = ?", (current_month_key,))
if cursor.fetchone()[0] == 0:
    cursor.executemany("""
        INSERT INTO challenges (month_key, title, description, topic, question_count)
        VALUES (?, ?, ?, ?, ?)
    """, [
        (current_month_key, "Basic Math", "Quiz on basic algebra & arithmetic", "Basic math: algebra, fractions, linear equations", 5),
        (current_month_key, "General Science", "Quiz on basic physics & chemistry", "Basic science: Newton's laws, simple chemical reactions, the solar system", 5),
        (current_month_key, "Language & Logic", "Quiz on grammar & logical reasoning", "Basic English grammar, simple logical reasoning", 5),
    ])
    print(f"+ 3 default challenges for {current_month_key} added")

# ---------- To Do List table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS todos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task TEXT NOT NULL,
    is_done INTEGER NOT NULL DEFAULT 0,
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")

# ---------- Notes table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS notes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'default',
    pinned INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)
""")
# ---------- Follows table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS follows(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, followed_id),
    FOREIGN KEY(follower_id) REFERENCES users(id),
    FOREIGN KEY(followed_id) REFERENCES users(id)
)
""")

# ---------- Blocks table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS blocks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id),
    FOREIGN KEY(blocker_id) REFERENCES users(id),
    FOREIGN KEY(blocked_id) REFERENCES users(id)
)
""")

# ---------- Reports table ----------
cursor.execute("""
CREATE TABLE IF NOT EXISTS reports(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    reported_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(reporter_id) REFERENCES users(id),
    FOREIGN KEY(reported_id) REFERENCES users(id)
)
""")

add_column_if_missing("users", "favorite_song_title TEXT DEFAULT ''")
add_column_if_missing("users", "favorite_song_artist TEXT DEFAULT ''")

connection.commit()
connection.close()
print("Database and tables created / updated successfully!")