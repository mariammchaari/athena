#!/bin/zsh
# Regenerates Pingo's voice: slower speech is sped up, which raises the pitch into a cute character register.
# Change VOICE, RATE or SHIFT, then re-run: node timeline.mjs && node audio.mjs && re-encode.
cd "${0:a:h}"; VOICE=${VOICE:-Samantha}; RATE=${RATE:-104}; SHIFT=${SHIFT:-1.7}
/usr/bin/python3 -c "import json;[print(l['id'],l['text'],sep='\t') for l in json.load(open('lines.json'))]" | while IFS=$'\t' read id text; do
  say -v "$VOICE" -r "$RATE" -o build/voice/$id.aiff "$text"; afconvert -f WAVE -d LEI16@44100 -c 1 build/voice/$id.aiff build/voice/$id.raw.wav
  node shift.mjs build/voice/$id.raw.wav build/voice/$id.wav $SHIFT
done
