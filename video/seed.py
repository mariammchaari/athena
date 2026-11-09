"""Sample data for the demo video. Only ever touches video/build/demo.db. Everyone here is fictional."""
import json, sqlite3, sys, time, os
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build/demo.db")
c = sqlite3.connect(DB, timeout=10); now = time.time(); cmd = sys.argv[1]
if cmd == "reset":
    for t in "room_docs room_notes room_subs room_msgs room_members rooms messages conversations goals users llm_cache llm_calls".split(): c.execute("DELETE FROM " + t)
elif cmd == "user":
    uid = c.execute("SELECT id FROM users WHERE email='lina.codes'").fetchone()[0]
    c.execute("UPDATE users SET diag_done=1 WHERE id=?", (uid,))
    cid = c.execute("INSERT INTO conversations(user_id,title,created) VALUES(?,?,?)", (uid, "Binary numbers", now - 7200)).lastrowid
    for q in ["What is binary?", "How do I count in binary?", "Why do computers use bits?"]:
        c.execute("INSERT INTO messages(conv_id,role,content,mode,created) VALUES(?,?,?,?,?)", (cid, "user", q, "auto", now - 7000))
    people = {}
    for name, team in [("Yassine", 1), ("Sara", 1), ("Omar", 2), ("Nour", 2)]:
        people[name] = (c.execute("INSERT INTO users(email,name,pw_hash,salt,created) VALUES(?,?,'x','x',?)", ("demo." + name.lower(), name, now)).lastrowid, team)
    content = {"status": "ready", "offline": False, "material": None,
      "brief": {"summary": "Bits, binary addition and the circuits that do it.", "key_points": ["A bit is 0 or 1.", "1 + 1 in binary is 10."], "glossary": [], "questions": []},
      "quiz": [
        {"q": "What is **1 + 1** in binary?", "options": ["2", "10", "11", "01"], "answer": 1, "explain": "In binary, 1 + 1 is written 10: a sum of 0 and a carry of 1."},
        {"q": "Which two outputs does a **half adder** produce?", "options": ["Sum and carry", "Input and output", "Clock and reset", "High and low"], "answer": 0, "explain": "A half adder adds two bits and outputs their sum and a carry."},
        {"q": "How many values can **3 bits** represent?", "options": ["3", "6", "8", "9"], "answer": 2, "explain": "2 to the power 3 is 8."}]}
    rid = c.execute("INSERT INTO rooms(code,host_id,title,topic,lang,rounds,difficulty,teams,prep_min,compete_min,quiz_n,phase,phase_started,phase_ends,content,created) VALUES('LOGIC1',?,?,?,?,?,?,?,?,?,?,'prep',?,?,?,?)",
      (uid, "Logic League", "Binary and adders", "en", json.dumps(["quiz"]), "undergraduate", 2, 15, 20, 3, now, now + 900, json.dumps(content), now)).lastrowid
    c.execute("INSERT INTO room_members VALUES(?,?,1,?,?)", (rid, uid, now, now + 9999))
    for n, (u, t) in people.items(): c.execute("INSERT INTO room_members VALUES(?,?,?,?,?)", (rid, u, t, now, now + 9999))
    y, s = people["Yassine"][0], people["Sara"][0]
    for u, m in [(y, "Hi team! Ready for the quiz?"), (s, "Yes! I just revised binary addition.")]:
        c.execute("INSERT INTO room_msgs(room_id,team,user_id,kind,anon,content,phase,created) VALUES(?,1,?,'chat',0,?,'prep',?)", (rid, u, m, now))
elif cmd == "team":
    rid = c.execute("SELECT id FROM rooms ORDER BY id DESC LIMIT 1").fetchone()[0]
    for name, team in [("Yassine", 1), ("Sara", 1), ("Omar", 2), ("Nour", 2)]:
        u = c.execute("INSERT INTO users(email,name,pw_hash,salt,style,diag_done,created) VALUES(?,?,'x','x',?,1,?)", ("demo." + name.lower(), name, ["visual","steps","analogy","practice"][len(name) % 4], now)).lastrowid
        c.execute("INSERT INTO room_members VALUES(?,?,?,?,?)", (rid, u, team, now, now + 9999))
elif cmd == "reply":
    rid = c.execute("SELECT id FROM rooms WHERE code='LOGIC1'").fetchone()[0]; s = c.execute("SELECT id FROM users WHERE email='demo.sara'").fetchone()[0]
    c.execute("INSERT INTO room_msgs(room_id,team,user_id,kind,anon,content,phase,created) VALUES(?,1,?,'chat',0,?,'compete',?)", (rid, s, "Yes please! Let's go through it together.", now))
c.commit()
