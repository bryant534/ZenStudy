from flask import Blueprint, render_template, request, redirect, url_for, session, jsonify
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta, date
import os
import json
from anthropic import Anthropic
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

ai_client = Anthropic(
    api_key=os.getenv("ANTHROPIC_API_KEY")
)
AI_MODEL = "claude-sonnet-5"

auth = Blueprint("auth", __name__)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "users.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ================= AUTH =================

@auth.route("/")
def index():
    return render_template("login/login.html")


@auth.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["Username"]
        password = request.form["Password"]

        connection = get_db()
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        connection.close()

        if user and check_password_hash(user["password"], password):
            session['user_id'] = user["id"]
            session['username'] = user["username"]
            return redirect(url_for("auth.home"))
        else:
            return "Wrong username or password"
        
    return render_template("login/login.html")


@auth.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth.login"))


@auth.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        email = request.form["Email"]
        username = request.form["Username"]
        password = request.form["Password"]
        confirm_password = request.form["ConfirmPassword"]

        if password != confirm_password:
            return "Passwords do not match"

        connection = get_db()
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            connection.close()
            return "Username already exists"

        cursor.execute("""
        INSERT INTO users (email, username, password)
        VALUES (?, ?, ?)
        """, (email, username, generate_password_hash(password)))
        connection.commit()
        connection.close()

        return redirect(url_for("auth.login"))

    return render_template("login/signup.html")


# ================= HOME =================

@auth.route("/home")
def home():
    if 'username' not in session:
        return redirect(url_for("auth.login"))

    user_id = session['user_id']
    connection = get_db()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT title, event_date FROM calendar_events
        WHERE user_id = ? AND event_date BETWEEN date('now') AND date('now', '+7 days')
        ORDER BY event_date ASC
    """, (user_id,))
    notifications = cursor.fetchall()

    active_list = get_active_study_list(cursor)

    connection.close()
    return render_template(
        "home/home.html",
        username=session['username'],
        notifications=notifications,
        active_list=active_list
    )


def expire_stale_active_sessions(cursor):
    """If a session was started but the person never came back to press
    Stop/Finish (closed the tab, browser crash, etc.), it would otherwise
    stay 'active' forever. Auto-close anything that's run well past its
    planned duration, logging what was actually studied."""
    cursor.execute("SELECT user_id, topic, started_at, planned_minutes FROM active_sessions")
    rows = cursor.fetchall()
    now = datetime.now()
    grace_minutes = 15

    for r in rows:
        started_at = datetime.strptime(r["started_at"], "%Y-%m-%d %H:%M:%S")
        elapsed_minutes = (now - started_at).total_seconds() / 60

        if elapsed_minutes > (r["planned_minutes"] or 0) + grace_minutes:
            actual_minutes = max(1, int(min(elapsed_minutes, r["planned_minutes"] or elapsed_minutes)))
            cursor.execute("""
                INSERT INTO study_sessions (user_id, topic, duration_minutes, study_date)
                VALUES (?, ?, ?, date('now'))
            """, (r["user_id"], r["topic"], actual_minutes))
            cursor.execute("DELETE FROM active_sessions WHERE user_id = ?", (r["user_id"],))

    cursor.connection.commit()


def get_active_study_list(cursor, limit=5):
    expire_stale_active_sessions(cursor)

    cursor.execute("""
        SELECT users.id as user_id, users.username, active_sessions.topic, active_sessions.started_at
        FROM active_sessions
        JOIN users ON users.id = active_sessions.user_id
        ORDER BY active_sessions.started_at DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()

    now = datetime.now()
    result = []
    for r in rows:
        started_at = datetime.strptime(r["started_at"], "%Y-%m-%d %H:%M:%S")
        elapsed_seconds = int((now - started_at).total_seconds())
        result.append({
            "user_id": r["user_id"],
            "username": r["username"],
            "topic": r["topic"],
            "elapsed_seconds": max(0, elapsed_seconds)
        })
    return result


@auth.route("/api/active_sessions")
def api_active_sessions():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    active_list = get_active_study_list(cursor)
    connection.close()

    return jsonify({"status": "success", "active_list": active_list})


# ================= STUDY =================

@auth.route("/study")
def study():
    if 'username' not in session:
        return redirect(url_for("auth.login"))

    return render_template("home/study.html", username=session['username'])

# ================= AI Study Helper =================

@auth.route("/study-ai")
def study_ai():
    if 'username' not in session:
        return redirect(url_for("auth.login"))
    return render_template("home/ai_study.html", username=session['username'])


def call_claude_json(system_prompt, user_prompt):
    response = ai_client.messages.create(
        model=AI_MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return json.loads(text)


def generate_quiz(material, count):
    system_prompt = (
        "You are a quiz question generator for a study app called ZenStudy. "
        "Reply with ONLY valid JSON, no other text, no markdown code fences, following exactly this schema: "
        '{"questions": [{"question": "...", "options": ["...", "...", "...", "..."], '
        '"correct_index": 0, "explanation": "..."}]}. '
        "correct_index is the 0-3 index of the correct option. All text in English."
    )
    user_prompt = f"Create {count} multiple-choice questions (4 options) from the following material:\n\n{material}"
    return call_claude_json(system_prompt, user_prompt)


def generate_flashcards(material, count):
    system_prompt = (
        "You are a flashcard generator for a study app. "
        "Reply with ONLY valid JSON, no other text, following exactly this schema: "
        '{"cards": [{"front": "...", "back": "..."}]}. '
        "front contains a short term/question, back contains a short answer/explanation. English."
    )
    user_prompt = f"Create {count} flashcards from the following material:\n\n{material}"
    return call_claude_json(system_prompt, user_prompt)


def generate_summary(material):
    system_prompt = (
        "You are a study assistant. Reply with ONLY valid JSON, no other text, following exactly this schema: "
        '{"summary": "..."}. '
        "Fill summary with a summary of the key points in English, "
        "using this format: lines starting with '- ' for bullet points, and **word** for important emphasis."
    )
    user_prompt = f"Summarize the following material into key points:\n\n{material}"
    return call_claude_json(system_prompt, user_prompt)


def answer_question(question, material):
    system_prompt = (
        "You are a friendly study tutor for the ZenStudy app. Answer the student's question "
        "(including math, science, or anything else) clearly, using step-by-step explanations when needed. "
        "Answer in English, as plain text (not JSON)."
    )
    user_prompt = f"Material context:\n{material}\n\nQuestion: {question}" if material else question

    response = ai_client.messages.create(
        model=AI_MODEL,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    return {"answer": text.strip()}


@auth.route("/api/ai/generate", methods=["POST"])
def ai_generate():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    data = request.get_json()
    mode = data.get("mode")
    material = (data.get("material") or "").strip()
    question = (data.get("question") or "").strip()
    count = int(data.get("count") or 5)

    if mode in ("quiz", "flashcard", "summary") and not material:
        return jsonify({"status": "error", "message": "The material is empty, please paste your study material first"}), 400
    if mode == "ask" and not question:
        return jsonify({"status": "error", "message": "The question is empty"}), 400

    try:
        if mode == "quiz":
            result = generate_quiz(material, count)
        elif mode == "flashcard":
            result = generate_flashcards(material, count)
        elif mode == "summary":
            result = generate_summary(material)
        elif mode == "ask":
            result = answer_question(question, material)
        else:
            return jsonify({"status": "error", "message": "Unrecognized mode"}), 400
    except json.JSONDecodeError:
        return jsonify({"status": "error", "message": "AI returned an unexpected format, please try again"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": f"AI failed to respond: {str(e)}"}), 500

    return jsonify({"status": "success", "mode": mode, "result": result})

@auth.route("/api/study/status")
def study_status():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    user_id = session['user_id']
    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("SELECT topic, started_at, planned_minutes FROM active_sessions WHERE user_id = ?", (user_id,))
    active = cursor.fetchone()
    connection.close()

    if not active:
        return jsonify({"status": "success", "active": None})

    started_at = datetime.strptime(active["started_at"], "%Y-%m-%d %H:%M:%S")
    elapsed_seconds = max(0, int((datetime.now() - started_at).total_seconds()))

    return jsonify({
        "status": "success",
        "active": {
            "topic": active["topic"],
            "planned_minutes": active["planned_minutes"],
            "elapsed_seconds": elapsed_seconds
        }
    })


@auth.route("/api/study/start", methods=["POST"])
def start_study_session():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    data = request.get_json()
    topic = (data.get("topic") or "Study").strip()
    planned_minutes = int(data.get("planned_minutes") or 25)
    user_id = session['user_id']
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM active_sessions WHERE user_id = ?", (user_id,))
    cursor.execute("""
        INSERT INTO active_sessions (user_id, topic, started_at, planned_minutes)
        VALUES (?, ?, ?, ?)
    """, (user_id, topic, now_str, planned_minutes))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})


@auth.route("/api/study/finish", methods=["POST"])
def finish_study_session():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    user_id = session['user_id']
    data = request.get_json() or {}
    actual_minutes = data.get("actual_minutes")

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM active_sessions WHERE user_id = ?", (user_id,))
    active = cursor.fetchone()

    if active:
        if actual_minutes is None:
            started_at = datetime.strptime(active["started_at"], "%Y-%m-%d %H:%M:%S")
            actual_minutes = max(1, int((datetime.now() - started_at).total_seconds() // 60))

        cursor.execute("""
            INSERT INTO study_sessions (user_id, topic, duration_minutes, study_date)
            VALUES (?, ?, ?, date('now'))
        """, (user_id, active["topic"], int(actual_minutes)))
        cursor.execute("DELETE FROM active_sessions WHERE user_id = ?", (user_id,))
        connection.commit()

    connection.close()
    return jsonify({"status": "success"})


@auth.route("/api/study/cancel", methods=["POST"])
def cancel_study_session():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM active_sessions WHERE user_id = ?", (session['user_id'],))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})

@auth.route("/save_study_session", methods=["POST"])
def save_study_session():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"})

    data = request.get_json()
    duration = data.get("duration_minutes")
    user_id = session['user_id']

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        INSERT INTO study_sessions (user_id, duration_minutes, study_date)
        VALUES (?, ?, date('now'))
    """, (user_id, duration))
    connection.commit()
    connection.close()

    return jsonify({"status": "success", "message": f"Saved {duration} minutes of study!"})


# ================= PROFILE (streak & statistic) =================

@auth.route("/profile")
@auth.route("/profile/<int:user_id>")
def profile(user_id=None):
    if 'username' not in session:
        return redirect(url_for("auth.login"))

    viewer_id = session['user_id']
    target_id = user_id if user_id is not None else viewer_id
    is_own_profile = (target_id == viewer_id)

    connection = get_db()
    cursor = connection.cursor()

    cursor.execute("SELECT id, username, bio FROM users WHERE id = ?", (target_id,))
    target_user = cursor.fetchone()
    if not target_user:
        connection.close()
        return redirect(url_for("auth.home"))

    cursor.execute("SELECT COUNT(*) as cnt FROM follows WHERE followed_id = ?", (target_id,))
    follower_count = cursor.fetchone()["cnt"]
    cursor.execute("SELECT COUNT(*) as cnt FROM follows WHERE follower_id = ?", (target_id,))
    following_count = cursor.fetchone()["cnt"]

    is_following = False
    is_blocked_by_me = False
    if not is_own_profile:
        cursor.execute("SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?", (viewer_id, target_id))
        is_following = cursor.fetchone() is not None
        cursor.execute("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?", (viewer_id, target_id))
        is_blocked_by_me = cursor.fetchone() is not None

    cursor.execute("""
        SELECT DISTINCT study_date FROM study_sessions
        WHERE user_id = ? ORDER BY study_date ASC
    """, (target_id,))
    all_dates = [datetime.strptime(r["study_date"], "%Y-%m-%d").date() for r in cursor.fetchall()]

    current_streak, longest_streak, is_active_today = compute_streaks(all_dates)

    cursor.execute("SELECT AVG(duration_minutes) as avg_dur FROM study_sessions WHERE user_id = ?", (target_id,))
    avg_row = cursor.fetchone()
    avg_minutes = round(avg_row["avg_dur"] or 0)

    cursor.execute("""
        SELECT SUM(duration_minutes) as total_min FROM study_sessions
        WHERE user_id = ? AND study_date >= date('now', '-7 days')
    """, (target_id,))
    week_row = cursor.fetchone()
    weekly_hours = round((week_row["total_min"] or 0) / 60, 1)

    cursor.execute("SELECT favorite_song_title, favorite_song_artist FROM users WHERE id = ?", (target_id,))
    song_row = cursor.fetchone()

    cursor.execute("""
        SELECT id, content, created_at FROM posts
        WHERE user_id = ?
        ORDER BY created_at DESC
    """, (target_id,))
    profile_posts = cursor.fetchall()

    connection.close()

    return render_template(
        "home/profile.html",
        username=target_user["username"],
        target_user_id=target_id,
        bio=target_user["bio"] or "",
        favorite_song_title=song_row["favorite_song_title"] or "",
        favorite_song_artist=song_row["favorite_song_artist"] or "",
        profile_posts=profile_posts,
        is_own_profile=is_own_profile,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
        is_blocked_by_me=is_blocked_by_me,
        current_streak=current_streak,
        longest_streak=longest_streak,
        is_active_today=is_active_today,
        avg_minutes=avg_minutes,
        weekly_hours=weekly_hours
    )


@auth.route("/api/profile/bio", methods=["PUT"])
def update_bio():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    data = request.get_json()
    bio = (data.get("bio") or "").strip()[:280]

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("UPDATE users SET bio = ? WHERE id = ?", (bio, session['user_id']))
    connection.commit()
    connection.close()

    return jsonify({"status": "success", "bio": bio})


def is_blocked_either_way(cursor, user_a, user_b):
    cursor.execute("""
        SELECT 1 FROM blocks
        WHERE (blocker_id = ? AND blocked_id = ?)
           OR (blocker_id = ? AND blocked_id = ?)
    """, (user_a, user_b, user_b, user_a))
    return cursor.fetchone() is not None

@auth.route("/api/profile/song", methods=["PUT"])
def update_favorite_song():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    data = request.get_json()
    title = (data.get("title") or "").strip()[:100]
    artist = (data.get("artist") or "").strip()[:100]

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("UPDATE users SET favorite_song_title = ?, favorite_song_artist = ? WHERE id = ?",
                   (title, artist, session['user_id']))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})

@auth.route("/api/users/<int:user_id>/follow", methods=["POST"])
def toggle_follow(user_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401
    viewer_id = session['user_id']
    if viewer_id == user_id:
        return jsonify({"status": "error", "message": "You cannot follow yourself"}), 400

    connection = get_db()
    cursor = connection.cursor()

    if is_blocked_either_way(cursor, viewer_id, user_id):
        connection.close()
        return jsonify({"status": "error", "message": "You can't follow this user"}), 403

    cursor.execute("SELECT id FROM follows WHERE follower_id = ? AND followed_id = ?", (viewer_id, user_id))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("DELETE FROM follows WHERE id = ?", (existing["id"],))
        following = False
    else:
        cursor.execute("INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)", (viewer_id, user_id))
        following = True

    connection.commit()
    cursor.execute("SELECT COUNT(*) as cnt FROM follows WHERE followed_id = ?", (user_id,))
    follower_count = cursor.fetchone()["cnt"]
    connection.close()

    return jsonify({"status": "success", "following": following, "follower_count": follower_count})


@auth.route("/api/users/<int:user_id>/block", methods=["POST"])
def toggle_block(user_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401
    viewer_id = session['user_id']
    if viewer_id == user_id:
        return jsonify({"status": "error", "message": "You cannot block yourself"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?", (viewer_id, user_id))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("DELETE FROM blocks WHERE id = ?", (existing["id"],))
        blocked = False
    else:
        cursor.execute("INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)", (viewer_id, user_id))
        # Blocking severs any follow relationship in either direction
        cursor.execute("""
            DELETE FROM follows
            WHERE (follower_id = ? AND followed_id = ?) OR (follower_id = ? AND followed_id = ?)
        """, (viewer_id, user_id, user_id, viewer_id))
        blocked = True

    connection.commit()
    connection.close()

    return jsonify({"status": "success", "blocked": blocked})


@auth.route("/api/users/<int:user_id>/report", methods=["POST"])
def report_user(user_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401
    viewer_id = session['user_id']
    if viewer_id == user_id:
        return jsonify({"status": "error", "message": "You cannot report yourself"}), 400

    data = request.get_json()
    reason = (data.get("reason") or "").strip()
    if not reason:
        return jsonify({"status": "error", "message": "Please provide a reason"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("INSERT INTO reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)",
                   (viewer_id, user_id, reason))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})


@auth.route("/api/users/<int:user_id>/card")
def get_user_card(user_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    viewer_id = session['user_id']
    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("SELECT id, username, bio FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()

    if not user:
        connection.close()
        return jsonify({"status": "error", "message": "User not found"}), 404

    cursor.execute("SELECT COUNT(*) as cnt FROM follows WHERE followed_id = ?", (user_id,))
    follower_count = cursor.fetchone()["cnt"]
    cursor.execute("SELECT COUNT(*) as cnt FROM follows WHERE follower_id = ?", (user_id,))
    following_count = cursor.fetchone()["cnt"]

    is_following = False
    is_blocked_by_me = False
    if viewer_id != user_id:
        cursor.execute("SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?", (viewer_id, user_id))
        is_following = cursor.fetchone() is not None
        cursor.execute("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?", (viewer_id, user_id))
        is_blocked_by_me = cursor.fetchone() is not None

    connection.close()

    return jsonify({
        "status": "success",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "bio": user["bio"] or "",
            "follower_count": follower_count,
            "following_count": following_count,
            "is_following": is_following,
            "is_blocked_by_me": is_blocked_by_me,
            "is_own": user["id"] == viewer_id
        }
    })

def compute_streaks(all_dates):
    if not all_dates:
        return 0, 0, False

    unique_dates = sorted(set(all_dates))

    longest = 1
    run = 1
    for i in range(1, len(unique_dates)):
        if (unique_dates[i] - unique_dates[i - 1]).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)

    today = date.today()
    yesterday = today - timedelta(days=1)
    last_date = unique_dates[-1]

    is_active_today = last_date == today
    streak_broken = last_date not in (today, yesterday)

    if streak_broken:
        current_streak = 0
    else:
        current_streak = 1
        idx = len(unique_dates) - 1
        while idx > 0 and (unique_dates[idx] - unique_dates[idx - 1]).days == 1:
            current_streak += 1
            idx -= 1

    longest_streak = max(longest, current_streak)
    return current_streak, longest_streak, is_active_today


# ================= Calendar =================

@auth.route("/calendar")
def calendar():
    if 'username' not in session:
        return redirect(url_for("auth.login"))
    return render_template("home/calendar.html")


@auth.route("/api/calendar_events", methods=["GET"])
def get_calendar_events():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    year = request.args.get("year")
    month = request.args.get("month")
    user_id = session['user_id']

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, title, event_date, event_time FROM calendar_events
        WHERE user_id = ?
          AND strftime('%Y', event_date) = ?
          AND strftime('%m', event_date) = ?
        ORDER BY event_date ASC, event_time ASC
    """, (user_id, str(year), f"{int(month):02d}"))
    rows = cursor.fetchall()
    connection.close()

    events = {}
    for r in rows:
        events.setdefault(r["event_date"], []).append({
            "id": r["id"], "title": r["title"], "time": r["event_time"]
        })

    return jsonify({"status": "success", "events": events})


@auth.route("/api/calendar_events", methods=["POST"])
def add_calendar_event():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    data = request.get_json()
    event_date = data.get("date")
    event_time = data.get("time")
    title = (data.get("title") or "").strip()
    user_id = session['user_id']

    if not event_date or not event_time or not title:
        return jsonify({"status": "error", "message": "Date, time, and activity are required"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        INSERT INTO calendar_events (user_id, title, event_date, event_time)
        VALUES (?, ?, ?, ?)
    """, (user_id, title, event_date, event_time))
    connection.commit()
    new_id = cursor.lastrowid
    connection.close()

    return jsonify({"status": "success", "event": {"id": new_id, "title": title, "time": event_time}})


@auth.route("/api/calendar_events/<int:event_id>", methods=["DELETE"])
def delete_calendar_event(event_id):
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM calendar_events WHERE id = ? AND user_id = ?", (event_id, session['user_id']))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})

# ================= Schedule & Global Chat =================
@auth.route("/schedule")
def schedule():
    if 'username' not in session:
        return redirect(url_for("auth.login"))
    return render_template("home/schedule.html")


@auth.route("/global_chat")
def global_chat():
    if 'username' not in session:
        return redirect(url_for("auth.login"))
    return render_template("home/global_chat.html", username=session['username'], user_id=session['user_id'])


# ---------- API: Feed / Post ----------

@auth.route("/api/posts", methods=["POST"])
def create_post():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    content = (request.get_json().get("content") or "").strip()
    if not content:
        return jsonify({"status": "error", "message": "Post cannot be empty"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("INSERT INTO posts (user_id, content) VALUES (?, ?)", (session['user_id'], content))
    connection.commit()
    new_id = cursor.lastrowid
    connection.close()

    return jsonify({"status": "success", "post_id": new_id})


@auth.route("/api/posts", methods=["GET"])
def get_posts():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    user_id = session['user_id']
    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT posts.id, posts.user_id, posts.content, posts.created_at, users.username,
               (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS like_count,
               (SELECT COUNT(*) FROM post_comments WHERE post_id = posts.id) AS comment_count,
               EXISTS(SELECT 1 FROM post_likes WHERE post_id = posts.id AND user_id = ?) AS liked_by_me
        FROM posts
        JOIN users ON users.id = posts.user_id
        WHERE posts.user_id NOT IN (
            SELECT blocked_id FROM blocks WHERE blocker_id = ?
            UNION
            SELECT blocker_id FROM blocks WHERE blocked_id = ?
        )
        ORDER BY posts.created_at DESC
        LIMIT 50
    """, (user_id, user_id, user_id))
    rows = cursor.fetchall()
    connection.close()

    posts = [{
        "id": r["id"], "user_id": r["user_id"], "username": r["username"],
        "content": r["content"], "created_at": r["created_at"],
        "like_count": r["like_count"], "comment_count": r["comment_count"],
        "liked_by_me": bool(r["liked_by_me"])
    } for r in rows]

    return jsonify({"status": "success", "posts": posts})


@auth.route("/api/posts/<int:post_id>/comments", methods=["GET"])
def get_comments(post_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT post_comments.user_id, post_comments.content, post_comments.created_at, users.username
        FROM post_comments
        JOIN users ON users.id = post_comments.user_id
        WHERE post_id = ?
        ORDER BY post_comments.created_at ASC
    """, (post_id,))
    rows = cursor.fetchall()
    connection.close()

    comments = [{"user_id": r["user_id"], "username": r["username"], "content": r["content"], "created_at": r["created_at"]} for r in rows]
    return jsonify({"status": "success", "comments": comments})


@auth.route("/api/posts/<int:post_id>/comments", methods=["POST"])
def add_comment(post_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    content = (request.get_json().get("content") or "").strip()
    if not content:
        return jsonify({"status": "error", "message": "Comment cannot be empty"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)",
                   (post_id, session['user_id'], content))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})


# ---------- API: Global Chat ----------

@auth.route("/api/chat_messages", methods=["GET"])
def get_chat_messages():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    since_id = request.args.get("since_id", 0, type=int)
    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT chat_messages.id, chat_messages.user_id, chat_messages.content, chat_messages.created_at, users.username
        FROM chat_messages
        JOIN users ON users.id = chat_messages.user_id
        WHERE chat_messages.id > ?
        ORDER BY chat_messages.id ASC
        LIMIT 100
    """, (since_id,))
    rows = cursor.fetchall()
    connection.close()

    messages = [{"id": r["id"], "user_id": r["user_id"], "username": r["username"], "content": r["content"], "created_at": r["created_at"]} for r in rows]
    return jsonify({"status": "success", "messages": messages})


@auth.route("/api/chat_messages", methods=["POST"])
def send_chat_message():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    content = (request.get_json().get("content") or "").strip()
    if not content:
        return jsonify({"status": "error", "message": "Message cannot be empty"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("INSERT INTO chat_messages (user_id, content) VALUES (?, ?)", (session['user_id'], content))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})

# ================== Challenge =================
@auth.route("/challenge")
def challenge():
    if 'username' not in session:
        return redirect(url_for("auth.login"))

    user_id = session['user_id']
    month_key = datetime.now().strftime("%Y-%m")

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM challenges WHERE month_key = ? ORDER BY id ASC", (month_key,))
    challenges_rows = cursor.fetchall()

    challenges_list = []
    for c in challenges_rows:
        cursor.execute("""
            SELECT score, total FROM challenge_attempts
            WHERE user_id = ? AND challenge_id = ?
            ORDER BY completed_at DESC LIMIT 1
        """, (user_id, c["id"]))
        attempt = cursor.fetchone()
        challenges_list.append({
            "id": c["id"],
            "title": c["title"],
            "description": c["description"],
            "question_count": c["question_count"],
            "completed": attempt is not None,
            "score": attempt["score"] if attempt else None,
            "total": attempt["total"] if attempt else None
        })

    connection.close()
    return render_template("home/challenge.html", username=session['username'], challenges=challenges_list)


@auth.route("/api/challenge/<int:challenge_id>/start", methods=["POST"])
def start_challenge(challenge_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM challenges WHERE id = ?", (challenge_id,))
    ch = cursor.fetchone()
    connection.close()

    if not ch:
        return jsonify({"status": "error", "message": "Challenge not found"}), 404

    try:
        quiz_data = generate_quiz(ch["topic"], ch["question_count"])
    except Exception as e:
        return jsonify({"status": "error", "message": f"AI failed to generate questions: {str(e)}"}), 500

    return jsonify({"status": "success", "questions": quiz_data["questions"]})


@auth.route("/api/challenge/<int:challenge_id>/submit", methods=["POST"])
def submit_challenge(challenge_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    data = request.get_json()
    score = int(data.get("score", 0))
    total = int(data.get("total", 0))

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        INSERT INTO challenge_attempts (user_id, challenge_id, score, total)
        VALUES (?, ?, ?, ?)
    """, (session['user_id'], challenge_id, score, total))
    connection.commit()
    connection.close()

    return jsonify({"status": "success"})


# ================== Messages & Settings =================
@auth.route("/messages")
def messages():
    if 'username' not in session:
        return redirect(url_for("auth.login"))

    conversations = [
        {"id": 1, "name": "Nadia Putri", "avatar": "N", "last_message": "Okay sure, tomorrow at 3pm!", "time": "12:41", "unread": 2, "online": True},
        {"id": 2, "name": "Study Group A", "avatar": "S", "last_message": "Send the chapter 4 summary please", "time": "11:05", "unread": 0, "online": False},
        {"id": 3, "name": "Rafi Hidayat", "avatar": "R", "last_message": "Thanks for the info!", "time": "Yesterday", "unread": 0, "online": True},
    ]
    return render_template("home/messages.html", username=session['username'], conversations=conversations)


@auth.route("/settings")
def settings():
    if 'username' not in session:
        return redirect(url_for("auth.login"))
    return render_template("home/settings.html", username=session['username'])

# ================= TO DO LIST =================

@auth.route("/todo")
def todo_list_page():
    if 'username' not in session:
        return redirect(url_for("auth.login"))
    return render_template("home/to_do_list.html", username=session['username'])


@auth.route("/api/todos", methods=["GET"])
def get_todos():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, task, is_done, due_date FROM todos
        WHERE user_id = ?
        ORDER BY is_done ASC, due_date IS NULL, due_date ASC, created_at DESC
    """, (session['user_id'],))
    rows = cursor.fetchall()
    connection.close()

    todos = [{"id": r["id"], "task": r["task"], "is_done": bool(r["is_done"]), "due_date": r["due_date"]} for r in rows]
    return jsonify({"status": "success", "todos": todos})


@auth.route("/api/todos", methods=["POST"])
def add_todo():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    data = request.get_json()
    task = (data.get("task") or "").strip()
    due_date = data.get("due_date") or None

    if not task:
        return jsonify({"status": "error", "message": "Task cannot be empty"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("INSERT INTO todos (user_id, task, due_date) VALUES (?, ?, ?)",
                   (session['user_id'], task, due_date))
    connection.commit()
    new_id = cursor.lastrowid
    connection.close()

    return jsonify({"status": "success", "todo": {"id": new_id, "task": task, "is_done": False, "due_date": due_date}})


@auth.route("/api/todos/<int:todo_id>", methods=["PUT"])
def update_todo(todo_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    data = request.get_json()
    connection = get_db()
    cursor = connection.cursor()

    if "is_done" in data:
        cursor.execute("UPDATE todos SET is_done = ? WHERE id = ? AND user_id = ?",
                       (1 if data["is_done"] else 0, todo_id, session['user_id']))
    if "task" in data:
        cursor.execute("UPDATE todos SET task = ? WHERE id = ? AND user_id = ?",
                       (data["task"].strip(), todo_id, session['user_id']))

    connection.commit()
    connection.close()
    return jsonify({"status": "success"})


@auth.route("/api/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, session['user_id']))
    connection.commit()
    connection.close()
    return jsonify({"status": "success"})


# ================= NOTES =================

@auth.route("/notes")
def notes_page():
    if 'username' not in session:
        return redirect(url_for("auth.login"))
    return render_template("home/notes.html", username=session['username'])


@auth.route("/api/notes", methods=["GET"])
def get_notes():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, title, content, color, pinned, updated_at FROM notes
        WHERE user_id = ?
        ORDER BY pinned DESC, updated_at DESC
    """, (session['user_id'],))
    rows = cursor.fetchall()
    connection.close()

    notes = [{
        "id": r["id"], "title": r["title"], "content": r["content"],
        "color": r["color"], "pinned": bool(r["pinned"]), "updated_at": r["updated_at"]
    } for r in rows]
    return jsonify({"status": "success", "notes": notes})


@auth.route("/api/notes", methods=["POST"])
def create_note():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("INSERT INTO notes (user_id, title, content) VALUES (?, '', '')", (session['user_id'],))
    connection.commit()
    new_id = cursor.lastrowid
    connection.close()

    return jsonify({"status": "success", "note_id": new_id})


@auth.route("/api/notes/<int:note_id>", methods=["PUT"])
def update_note(note_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    data = request.get_json()
    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        UPDATE notes SET title = ?, content = ?, color = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    """, (
        data.get("title", ""), data.get("content", ""), data.get("color", "default"),
        1 if data.get("pinned") else 0, note_id, session['user_id']
    ))
    connection.commit()
    connection.close()
    return jsonify({"status": "success"})


@auth.route("/api/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, session['user_id']))
    connection.commit()
    connection.close()
    return jsonify({"status": "success"})

#================= Day Events =================

@auth.route("/api/day_events", methods=["GET"])
def get_day_events():
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 401

    target_date = request.args.get("date")  # "YYYY-MM-DD"
    if not target_date:
        return jsonify({"status": "error", "message": "Date is required"}), 400

    connection = get_db()
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, title, event_time FROM calendar_events
        WHERE user_id = ? AND event_date = ?
        ORDER BY event_time ASC
    """, (session['user_id'], target_date))
    rows = cursor.fetchall()
    connection.close()

    events = [{"id": r["id"], "title": r["title"], "time": r["event_time"]} for r in rows]
    return jsonify({"status": "success", "events": events})