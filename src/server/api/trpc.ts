import { initTRPC } from "@trpc/server";
import superjson from "superjson";

const t = initTRPC.create({
  transformer: superjson,
});

export const { router, procedure, middleware } = t;
export const publicProcedure = procedure;
