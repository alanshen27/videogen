"use client";

/**
 * Must be self-contained (no root layout / providers). Kept minimal so
 * `next build` can prerender this route even when the app shell fails.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          background: "#141110",
          color: "#fafafa",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#a09b96" }}>
          {error.message || "An unexpected error occurred"}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(255,248,240,0.2)",
            background: "rgba(217,124,117,0.15)",
            color: "#fafafa",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
