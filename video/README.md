# Athena demo video
`Athena-Demo.mp4` is 90 s, 1920x1080, 30 fps. It uses the real site and real Pingo/garden components; the app source is not changed.

Rebuild (from `athena 2/`):
    cd backend; ATHENA_DB="$PWD/../video/build/demo.db" .venv/bin/uvicorn main:app --port 8003
    cd frontend; node_modules/.bin/vite --config ../video/vite.config.mjs
    cd video; ./voice.sh; node timeline.mjs; node audio.mjs
    afconvert -f m4af -d aac -b 192000 build/mix.wav build/mix.m4a
    node capture.mjs; swiftc -O encode.swift -o build/encode
    build/encode build/frames build/mix.m4a "$PWD/Athena-Demo.mp4"

Edit: `lines.json` dialogue and timing, `overlay.jsx` animation/camera/clicks, `seed.py` sample data, `audio.mjs` music and effects.
To use a human voice: record the lines in SCRIPT.md, save each as `build/voice/<id>.wav` (44.1 kHz, 16-bit mono), then run from `node timeline.mjs`.
AI answers are replayed from real API answers (8 Nov) by `replay_llm.py`; start it on port 9100 and run the demo backend with `LLM_BASE_URL=http://127.0.0.1:9100/v1 LLM_API_KEY=replay`.
All demo users and messages are fictional and live only in `build/demo.db`.
