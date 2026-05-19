# Audio assets

This directory holds music beds and SFX cues that the Remotion renderer
plays alongside ElevenLabs narration.

## Layout

```
public/audio/
  music/<name>.mp3   ← looped under narration (low volume)
  sfx/<name>.mp3     ← short cues fired at specific frames
```

The renderer references files by **name**, not path. Names must match the
enums in `src/server/llm/schemas.ts` (`MusicNameSchema`, `SfxNameSchema`).
To add a new cue, edit the enum AND drop the corresponding file here.

## What's shipped

- `sfx/ding.mp3` — 880 Hz beep, ~0.35s (stat reveal)
- `sfx/whoosh.mp3` — pink-noise burst, ~0.30s (scene transition)
- `sfx/type.mp3` — 1.4 kHz tick, ~0.06s (code typing)
- `sfx/pop.mp3` — 600 Hz blip, ~0.12s (callout)
- `sfx/thunk.mp3` — 180 Hz thud, ~0.20s (heavy element drop-in)

These were synthesized with ffmpeg as placeholders so the wiring is
exercisable in `/video-lab`. **Replace them with real designed SFX before
shipping a video** — synthesized beeps sound cheap.

`music/` is empty. Drop your own loops in (e.g. `music/lofi.mp3`,
`music/upbeat.mp3`, `music/ambient.mp3`) and add a `music:` field to the
spec to use them.

## Spec wiring

Scene-level SFX:

```jsonc
{
  "fromFrame": 0,
  "durationInFrames": 120,
  "sfx": [
    { "name": "whoosh", "atFrame": 0,  "volume": 0.6 },
    { "name": "ding",   "atFrame": 40, "volume": 0.8 }
  ],
  // ...
}
```

Composition-level music bed:

```jsonc
{
  "composition": { /* ... */ },
  "music": { "name": "lofi", "volume": 0.1 }, // 0..1, default 0.12
  "scenes": [ /* ... */ ]
}
```

If a referenced file is missing, the renderer still plays the rest of
the video — the missing track is just silent.
