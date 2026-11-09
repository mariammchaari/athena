"""Local stand-in for the OpenAI-compatible LLM API, for testing when the real key is blocked.

It returns canned text, so it tests the wiring, not answer quality.
Start it with: .venv/bin/uvicorn mock_llm:app --port 9000
Then start the backend with LLM_BASE_URL=http://127.0.0.1:9000/v1 and mock-* model names.
"""
import hashlib
import json
import time

from fastapi import FastAPI, Request

app = FastAPI()
MODELS = ["mock-compact", "mock-midsize", "mock-embed"]


@app.get("/v1/models")
def models():
    return {"object": "list", "data": [{"id": m, "object": "model"} for m in MODELS]}


@app.post("/v1/chat/completions")
async def chat(request: Request):
    body = await request.json()
    last = body["messages"][-1]["content"]
    text = f"[mock {body['model']}] I received: {last[:200]}"
    system = body["messages"][0]["content"]
    if "json" in system.lower():
        text = json.dumps({"mock": True, "text": text})
    return {
        "id": "mock-" + str(int(time.time() * 1000)),
        "object": "chat.completion",
        "model": body["model"],
        "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": text}}],
        "usage": {"prompt_tokens": len(str(body["messages"])) // 4, "completion_tokens": len(text) // 4},
    }


def _vector(text):
    digest = hashlib.sha256(text.encode()).digest()
    return [b / 255 for b in digest]


@app.post("/v1/embeddings")
async def embeddings(request: Request):
    body = await request.json()
    inputs = body["input"] if isinstance(body["input"], list) else [body["input"]]
    return {
        "object": "list",
        "model": body["model"],
        "data": [{"index": i, "object": "embedding", "embedding": _vector(t)} for i, t in enumerate(inputs)],
        "usage": {"prompt_tokens": 0},
    }
