"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Smartphone, Tv, RefreshCw, Play } from "lucide-react";
import type { RemotionSpec } from "@/server/llm/schemas";
import { VideoFromSpec } from "@/remotion/VideoFromSpec";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Player = dynamic(
  () => import("@remotion/player").then((m) => m.Player),
  { ssr: false }
);

const DEFAULT_PROPS_URL = "/smoke-remotion-input-props.json";

function parseInputProps(raw: string): { ok: true; spec: RemotionSpec } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Root must be a JSON object." };
    }
    const spec = (parsed as { spec?: unknown }).spec;
    if (!spec || typeof spec !== "object") {
      return { ok: false, error: 'Missing "spec" object (same shape as render input-props.json).' };
    }
    const s = spec as RemotionSpec;
    const c = s.composition;
    if (
      !c ||
      typeof c.durationInFrames !== "number" ||
      typeof c.fps !== "number" ||
      typeof c.width !== "number" ||
      typeof c.height !== "number"
    ) {
      return { ok: false, error: "spec.composition needs width, height, fps, durationInFrames." };
    }
    if (!Array.isArray(s.scenes)) {
      return { ok: false, error: "spec.scenes must be an array." };
    }
    return { ok: true, spec: s };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

function rotateSpec(spec: RemotionSpec, orientation: "landscape" | "portrait"): RemotionSpec {
  const targetWidth = orientation === "portrait" ? 1080 : 1920;
  const targetHeight = orientation === "portrait" ? 1920 : 1080;
  if (spec.composition.width === targetWidth && spec.composition.height === targetHeight) {
    return spec;
  }
  return {
    ...spec,
    composition: {
      ...spec.composition,
      width: targetWidth as 1080 | 1920,
      height: targetHeight as 1080 | 1920,
    },
  };
}

export default function VideoLabPage() {
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parseOutcome, setParseOutcome] = useState<
    { ok: true; spec: RemotionSpec } | { ok: false; error: string } | null
  >(null);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(DEFAULT_PROPS_URL);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const t = await res.text();
        if (!cancelled) {
          setText(t);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tryApply = useCallback(() => {
    setParseOutcome(parseInputProps(text));
  }, [text]);

  useEffect(() => {
    if (text.length === 0) return;
    const id = setTimeout(() => setParseOutcome(parseInputProps(text)), 400);
    return () => clearTimeout(id);
  }, [text]);

  const previewSpec = useMemo(() => {
    if (!parseOutcome?.ok) return null;
    return rotateSpec(parseOutcome.spec, orientation);
  }, [parseOutcome, orientation]);

  const playerKey = useMemo(() => {
    if (!previewSpec) return "invalid";
    return `${orientation}-${previewSpec.composition.durationInFrames}-${previewSpec.scenes.length}`;
  }, [previewSpec, orientation]);

  const aspectRatio = orientation === "portrait" ? "9 / 16" : "16 / 9";
  const playerMaxWidth = orientation === "portrait" ? "min(380px, 100%)" : "100%";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1920px] flex-col gap-4 p-3 sm:p-5 lg:flex-row lg:gap-6 lg:p-6">
        <div className="flex flex-col gap-3 lg:max-w-xl lg:flex-1 lg:min-h-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
            >
              ← Dashboard
            </Link>
            <h1 className="text-lg font-semibold">Video lab</h1>
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setOrientation("landscape")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition",
                  orientation === "landscape"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Landscape 16:9"
              >
                <Tv className="size-3.5" />
                <span className="hidden sm:inline">16:9</span>
              </button>
              <button
                type="button"
                onClick={() => setOrientation("portrait")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition",
                  orientation === "portrait"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Portrait 9:16"
              >
                <Smartphone className="size-3.5" />
                <span className="hidden sm:inline">9:16</span>
              </button>
            </div>
          </div>

          {/* Player surfaces first on mobile so previews are immediately visible */}
          <div className="order-1 flex flex-col gap-2 lg:hidden">
            <PreviewSurface
              previewSpec={previewSpec}
              playerKey={playerKey}
              aspectRatio={aspectRatio}
              playerMaxWidth={playerMaxWidth}
              orientation={orientation}
            />
          </div>

          <div className="order-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Edit Remotion input props · auto-preview ~400ms
            </p>
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline lg:hidden"
            >
              {showJson ? "Hide JSON" : "Edit JSON"}
            </button>
          </div>
          {loadError && (
            <p className="text-sm text-amber-600">
              Could not load default JSON ({loadError}). Paste props manually.
            </p>
          )}
          <textarea
            className={cn(
              "order-3 min-h-[260px] flex-1 resize-y rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground lg:min-h-[420px]",
              showJson ? "block" : "hidden lg:block"
            )}
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{ "spec": { "composition": …, "scenes": … } }'
          />
          <div
            className={cn(
              "order-4 flex flex-wrap gap-2",
              showJson ? "flex" : "hidden lg:flex"
            )}
          >
            <Button type="button" variant="secondary" size="sm" onClick={tryApply}>
              <Play className="size-4" />
              Apply now
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetch(DEFAULT_PROPS_URL).then((r) => r.text()).then(setText)}
            >
              <RefreshCw className="size-4" />
              Reset
            </Button>
          </div>
          {parseOutcome && !parseOutcome.ok && (
            <p className="order-5 text-sm text-destructive">{parseOutcome.error}</p>
          )}
        </div>

        <div className="hidden min-w-0 flex-[1.4] flex-col gap-2 lg:flex">
          <p className="text-xs text-muted-foreground">
            Preview — Remotion Player (client-only). Run{" "}
            <code className="rounded bg-muted px-1">npm run dev</code> and open{" "}
            <code className="rounded bg-muted px-1">/video-lab</code>.
          </p>
          <PreviewSurface
            previewSpec={previewSpec}
            playerKey={playerKey}
            aspectRatio={aspectRatio}
            playerMaxWidth={playerMaxWidth}
            orientation={orientation}
          />
        </div>
      </div>
    </div>
  );
}

function PreviewSurface({
  previewSpec,
  playerKey,
  aspectRatio,
  playerMaxWidth,
  orientation,
}: {
  previewSpec: RemotionSpec | null;
  playerKey: string;
  aspectRatio: string;
  playerMaxWidth: string;
  orientation: "landscape" | "portrait";
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border bg-black",
        orientation === "portrait" && "mx-auto"
      )}
      style={{ aspectRatio, maxWidth: playerMaxWidth }}
    >
      {previewSpec ? (
        <Player
          key={playerKey}
          component={
            VideoFromSpec as unknown as ComponentType<Record<string, unknown>>
          }
          inputProps={{ spec: previewSpec }}
          durationInFrames={previewSpec.composition.durationInFrames}
          fps={previewSpec.composition.fps}
          compositionWidth={previewSpec.composition.width}
          compositionHeight={previewSpec.composition.height}
          controls
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground sm:p-8 sm:text-sm">
          Fix JSON to show preview.
        </div>
      )}
    </div>
  );
}
