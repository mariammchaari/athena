"""Replays REAL answers the organisers' API gave on 8 Nov 2026 (the key has expired).
It only answers the requests the video makes; anything else gets a 503, so nothing is invented."""
import json, sqlite3, os, re
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
HERE = os.path.dirname(os.path.abspath(__file__))
app = FastAPI()
REC = json.load(open(os.path.join(HERE, "recorded_answers.json")))

@app.get("/v1/models")
def models():
    return {"object": "list", "data": [{"id": m} for m in ["qwen2.5-3b", "llama3.1-8b"]]}

@app.post("/v1/chat/completions")
async def chat(req: Request):
    b = await req.json(); system = b["messages"][0]["content"]; last = b["messages"][-1]["content"]
    key = ("diagnostic" if system.startswith("TASK=DIAG") else
           "room" if system.startswith("TASK=ROOM_CONTENT") else
           "derivee" if "dérivée" in last else
           "mux" if "multiplexer" in last.lower() else None)
    print("REPLAY", key, "|", last[:80].replace("\n", " "))
    if not key:
        return JSONResponse({"error": {"message": "not recorded"}}, 503)
    return {"choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": REC[key]}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0}, "model": b["model"]}
