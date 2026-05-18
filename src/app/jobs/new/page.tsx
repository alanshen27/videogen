"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Smartphone, Sparkles, Tv } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NewJobPage() {
  const router = useRouter();
  const createJob = trpc.job.create.useMutation({
    onSuccess: (data) => {
      router.push(`/jobs/${data.id}`);
    },
  });

  const [form, setForm] = useState({
    topic: "",
    durationSeconds: 90,
    audienceLevel: "BEGINNER" as const,
    style: "FIRESHIP" as const,
    orientation: "LANDSCAPE" as "LANDSCAPE" | "PORTRAIT",
    instructions: "",
    includeImages: true,
    generateThumbnail: true,
    renderVideo: true,
    voiceOver: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.topic.trim()) return;
    createJob.mutate(form);
  };

  const updateField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl p-4 sm:p-6">
      <Link
        href="/dashboard"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-4 -ml-2 h-auto gap-2 px-2 text-muted-foreground hover:text-foreground"
        )}
      >
        <ArrowLeft />
        Back to dashboard
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <Sparkles className="size-5 text-primary" />
            New video job
          </CardTitle>
          <CardDescription>
            Topic + options; the pipeline plans, scripts, renders, narrates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="topic">Topic *</Label>
              <Input
                id="topic"
                placeholder="e.g. 90-second explainer on Dijkstra's algorithm"
                value={form.topic}
                onChange={(e) => updateField("topic", e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (seconds)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={10}
                  max={600}
                  value={form.durationSeconds}
                  onChange={(e) =>
                    updateField(
                      "durationSeconds",
                      parseInt(e.target.value, 10) || 90
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Audience level</Label>
                <Select
                  value={form.audienceLevel}
                  onValueChange={(v) =>
                    updateField("audienceLevel", v as typeof form.audienceLevel)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BEGINNER">Beginner</SelectItem>
                    <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                    <SelectItem value="ADVANCED">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Style</Label>
                <Select
                  value={form.style}
                  onValueChange={(v) =>
                    updateField("style", v as typeof form.style)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRESHIP">Fireship (fast-paced)</SelectItem>
                    <SelectItem value="BYTEBYTEGO">
                      ByteByteGo (diagram-focused)
                    </SelectItem>
                    <SelectItem value="THREE_BLUE_ONE_BROWN">
                      3Blue1Brown (math visual)
                    </SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateField("orientation", "LANDSCAPE")}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-3 py-2 text-xs font-medium transition",
                      form.orientation === "LANDSCAPE"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    <Tv className="size-4" />
                    <span>Landscape 16:9</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField("orientation", "PORTRAIT")}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-3 py-2 text-xs font-medium transition",
                      form.orientation === "PORTRAIT"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    <Smartphone className="size-4" />
                    <span>Mobile 9:16</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Extra instructions</Label>
              <Textarea
                id="instructions"
                placeholder="Tone, pacing, must-include points, etc."
                value={form.instructions}
                onChange={(e) => updateField("instructions", e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="includeImages"
                  checked={form.includeImages}
                  onCheckedChange={(v) =>
                    updateField("includeImages", v === true)
                  }
                />
                <Label htmlFor="includeImages" className="cursor-pointer">
                  Include downloaded reference images (SerpAPI / Unsplash fallback)
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="generateThumbnail"
                  checked={form.generateThumbnail}
                  onCheckedChange={(v) =>
                    updateField("generateThumbnail", v === true)
                  }
                />
                <Label htmlFor="generateThumbnail" className="cursor-pointer">
                  Generate thumbnail spec
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="renderVideo"
                  checked={form.renderVideo}
                  onCheckedChange={(v) =>
                    updateField("renderVideo", v === true)
                  }
                />
                <Label htmlFor="renderVideo" className="cursor-pointer">
                  Auto-render MP4 with Remotion (needs Chrome on the worker machine)
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="voiceOver"
                  checked={form.voiceOver}
                  onCheckedChange={(v) =>
                    updateField("voiceOver", v === true)
                  }
                />
                <Label htmlFor="voiceOver" className="cursor-pointer">
                  ElevenLabs voice-over (per scene; needs{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    ELEVENLABS_API_KEY
                  </code>
                  )
                </Label>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full gap-2"
              size="lg"
              disabled={createJob.isPending || !form.topic.trim()}
            >
              <Sparkles />
              {createJob.isPending ? "Creating…" : "Create job"}
            </Button>

            {createJob.error && (
              <p className="text-sm text-destructive" role="alert">
                {createJob.error.message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
