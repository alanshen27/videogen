"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  XCircle,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/job-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function JsonViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 z-10 h-7 text-xs"
        onClick={() => {
          void navigator.clipboard.writeText(jsonString);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <pre className="max-h-96 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs text-muted-foreground">
        {jsonString}
      </pre>
    </div>
  );
}

function JobDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Skeleton className="h-8 w-32" />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="h-8 w-3/4 max-w-xl" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("logs");

  const {
    data: job,
    isLoading: jobLoading,
    refetch: refetchJob,
  } = trpc.job.getById.useQuery({ id });

  const { data: logs, isLoading: logsLoading } = trpc.job.logs.useQuery({
    jobId: id,
  });

  const { data: artifacts, isLoading: artifactsLoading } =
    trpc.job.artifacts.useQuery({ jobId: id });

  const retry = trpc.job.retry.useMutation({
    onSuccess: () => refetchJob(),
  });

  const cancel = trpc.job.cancel.useMutation({
    onSuccess: () => refetchJob(),
  });

  if (jobLoading) {
    return <JobDetailSkeleton />;
  }

  if (!job) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Job not found</CardTitle>
            <CardDescription>
              It may have been deleted or the link is wrong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard" className={cn(buttonVariants())}>
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canCancel = ["PENDING", "PLANNING", "SCRIPTING", "ASSETS"].includes(
    job.status
  );
  const canRetry = job.status === "FAILED";

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 h-auto gap-2 px-2 text-muted-foreground hover:text-foreground self-start"
          )}
        >
          <ArrowLeft />
          Back
        </Link>
        <div className="flex flex-wrap gap-2">
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => retry.mutate({ id: job.id })}
              disabled={retry.isPending}
            >
              <RefreshCw />
              Retry
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => cancel.mutate({ id: job.id })}
              disabled={cancel.isPending}
            >
              <XCircle />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{job.topic}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <JobStatusBadge status={job.status} />
                <span>{job.durationSeconds}s</span>
                <span>{job.audienceLevel}</span>
                <span>{job.style}</span>
                <span>{job.orientation === "PORTRAIT" ? "9:16" : "16:9"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{job.progress}%</span>
            {job.error && <span className="text-destructive">{job.error}</span>}
          </div>
          <Progress value={job.progress} className="h-2" />

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Created {new Date(job.createdAt).toLocaleString()}</span>
            <span>Updated {new Date(job.updatedAt).toLocaleString()}</span>
          </div>

          {job.instructions && (
            <>
              <Separator className="my-2" />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Instructions: </span>
                {job.instructions}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-3">
          <TabsList className="inline-flex w-max min-w-full justify-start">
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="script">Script</TabsTrigger>
            <TabsTrigger value="storyboard">Storyboard</TabsTrigger>
            <TabsTrigger value="scene-spec">Scene spec</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="remotion">Remotion spec</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {logsLoading ? (
                <p className="text-sm text-muted-foreground">Loading logs…</p>
              ) : !logs?.length ? (
                <p className="text-sm text-muted-foreground">No logs yet</p>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((log) => {
                      const levelColor =
                        log.level === "error"
                          ? "text-destructive"
                          : log.level === "warn"
                            ? "text-amber-400"
                            : "text-muted-foreground";
                      return (
                        <div key={log.id} className="flex gap-2">
                          <span className="shrink-0 text-muted-foreground/70">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </span>
                          <span
                            className={cn(
                              "w-10 shrink-0 uppercase",
                              levelColor
                            )}
                          >
                            {log.level}
                          </span>
                          <span className="text-foreground">{log.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <ArtifactPanel
            artifacts={artifacts}
            type="PLAN"
            loading={artifactsLoading}
          />
        </TabsContent>

        <TabsContent value="script" className="mt-4">
          <ArtifactPanel
            artifacts={artifacts}
            type="SCRIPT"
            loading={artifactsLoading}
          />
        </TabsContent>

        <TabsContent value="storyboard" className="mt-4">
          <ArtifactPanel
            artifacts={artifacts}
            type="STORYBOARD"
            loading={artifactsLoading}
          />
        </TabsContent>

        <TabsContent value="scene-spec" className="mt-4">
          <ArtifactPanel
            artifacts={artifacts}
            type="SCENE_SPEC"
            loading={artifactsLoading}
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <ArtifactPanel
            artifacts={artifacts}
            type="ASSETS"
            loading={artifactsLoading}
          />
        </TabsContent>

        <TabsContent value="remotion" className="mt-4">
          <ArtifactPanel
            artifacts={artifacts}
            type="REMOTION_SPEC"
            loading={artifactsLoading}
          />
        </TabsContent>

        <TabsContent value="metadata" className="mt-4">
          <ArtifactPanel
            artifacts={artifacts}
            type="METADATA"
            loading={artifactsLoading}
          />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {artifactsLoading ? (
                <p className="text-sm text-muted-foreground">Loading files…</p>
              ) : (
                <div className="space-y-2">
                  {(artifacts ?? [])
                    .filter((a) => a.filePath)
                    .map((artifact) => (
                      <div
                        key={artifact.id}
                        className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {artifact.type}
                          </Badge>
                          <span className="truncate font-mono text-sm text-muted-foreground">
                            {artifact.filePath}
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs">
                          <Download />
                          Download
                        </Button>
                      </div>
                    ))}
                  {(artifacts ?? []).filter((a) => a.filePath).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No file artifacts yet
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ArtifactPanel({
  artifacts,
  type,
  loading,
}: {
  artifacts?:
    | {
        id: string;
        type: string;
        contentJson: unknown;
        filePath: string | null;
        createdAt: Date;
      }[]
    | undefined;
  type: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const filtered = (artifacts ?? []).filter((a) => a.type === type);

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No {type.toLowerCase().replace(/_/g, " ")} generated yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {filtered.map((artifact) => (
        <Card key={artifact.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {type.replace(/_/g, " ")}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {new Date(artifact.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <JsonViewer data={artifact.contentJson} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
