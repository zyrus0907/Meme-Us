"use client";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "radial-gradient(ellipse at 50% -10%, #35296B, #14102B 60%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 430,
        minHeight: "100dvh",
        background: "var(--app-bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "background 0.3s ease",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {children}
      </div>
    </div>
  );
}
