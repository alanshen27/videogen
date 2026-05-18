"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/job-status-badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-6 flex-1 max-w-md" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = trpc.job.list.useQuery({ limit: 50 });

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AutoChannel</h1>
          <CardDescription className="mt-1 text-sm sm:text-base">
            AI video production dashboard
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/video-lab"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-2")}
          >
            Video lab
          </Link>
          <Link
            href="/jobs/new"
            className={cn(buttonVariants({ size: "sm" }), "gap-2")}
          >
            <Plus />
            New job
          </Link>
        </div>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : !data?.items?.length ? (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>No jobs yet</CardTitle>
            <CardDescription>
              Create your first video production job to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Link
              href="/jobs/new"
              className={cn(buttonVariants(), "gap-2")}
            >
              <Plus />
              Create your first job
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="cursor-pointer transition-[box-shadow,transform] hover:ring-2 hover:ring-ring/40">
                <CardContent className="p-5 pt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="min-w-0 truncate text-lg font-semibold">
                      {job.topic}
                    </h2>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <Progress value={job.progress} className="mb-2 h-2" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{job.progress}% complete</span>
                    <span>
                      {new Date(job.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {job.error && (
                    <p className="mt-2 truncate text-sm text-destructive">
                      {job.error}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
