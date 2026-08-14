import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px",
        background:
          "linear-gradient(135deg, #0d2b3a 0%, #15445c 55%, #1f6284 100%)",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <svg
          width="110"
          height="110"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="64" height="64" rx="12" fill="#0d2b3a" />
          <path d="M8 25 32 13l24 12-24 12L8 25Z" fill="#51b7d7" />
          <path d="M18 31v11c6 8 22 8 28 0V31l-14 7-14-7Z" fill="#fff" />
          <path
            d="M53 27v14"
            fill="none"
            stroke="#d65d2f"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{ fontSize: "60px", fontWeight: 700, letterSpacing: "-1.5px" }}
        >
          VistaTeacher
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <div
          style={{
            fontSize: "56px",
            lineHeight: 1.05,
            fontWeight: 700,
            maxWidth: "940px",
          }}
        >
          The network built for teachers
        </div>
        <div
          style={{
            fontSize: "30px",
            lineHeight: 1.35,
            opacity: 0.95,
            maxWidth: "960px",
          }}
        >
          Connect with educators, share practical resources, and plan stronger
          lessons.
        </div>
      </div>
    </div>,
    size,
  );
}
