"use client";

/**
 * Last resort when the root layout itself fails: no fonts or Tailwind here,
 * so the colours are inlined to match the app's dark field.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "max(3rem, env(safe-area-inset-top)) 1.25rem max(3rem, env(safe-area-inset-bottom))",
          background: "#0a0e0b",
          color: "#fff",
          fontFamily: "-apple-system, system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 8px" }}>
            TD Pool
          </h1>
          <p style={{ color: "rgba(255,255,255,0.66)", margin: "0 0 20px", lineHeight: 1.5 }}>
            Something went wrong loading the app.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 12,
              background: "#c7f94b",
              color: "#0a1a0f",
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "14px 22px",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
