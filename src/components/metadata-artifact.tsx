"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MetadataJson = {
  title?: string;
  description?: string;
  tags?: string[];
  shortsTitle?: string;
  shortsDescription?: string;
  hashtags?: string[];
  thumbnailPrompt?: string;
  category?: string;
  language?: string;
};

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check /> : <Copy />}
          Copy
        </Button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/50 p-3 font-sans text-sm leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

export function MetadataArtifactView({ data }: { data: unknown }) {
  const m = data as MetadataJson;
  if (!m?.title) return null;

  const hashtagLine =
    m.hashtags && m.hashtags.length > 0
      ? m.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">YouTube Shorts</CardTitle>
          <CardDescription>
            Paste title + description into the Shorts upload flow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyBlock
            label="Shorts title"
            text={m.shortsTitle ?? m.title}
          />
          <CopyBlock
            label="Shorts description"
            text={
              m.shortsDescription ??
              [m.description, hashtagLine].filter(Boolean).join("\n\n")
            }
          />
          {hashtagLine ? (
            <CopyBlock label="Hashtags only" text={hashtagLine} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Long-form</CardTitle>
          <CardDescription>Standard YouTube title, description, tags</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyBlock label="Title" text={m.title} />
          <CopyBlock label="Description" text={m.description ?? ""} />
          {m.tags && m.tags.length > 0 ? (
            <CopyBlock label="Tags (comma-separated)" text={m.tags.join(", ")} />
          ) : null}
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {m.category ? (
              <p>
                <span className="font-medium text-foreground">Category:</span>{" "}
                {m.category}
              </p>
            ) : null}
            {m.language ? (
              <p>
                <span className="font-medium text-foreground">Language:</span>{" "}
                {m.language}
              </p>
            ) : null}
          </div>
          {m.thumbnailPrompt ? (
            <CopyBlock label="Thumbnail prompt" text={m.thumbnailPrompt} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
