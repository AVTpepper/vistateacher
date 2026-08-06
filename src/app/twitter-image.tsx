import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 600,
};

export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "48px 64px",
        background: "#0d2b3a",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          maxWidth: "740px",
        }}
      >
        <div style={{ fontSize: "28px", opacity: 0.9 }}>VistaTeacher</div>
        <div
          style={{
            fontSize: "68px",
            lineHeight: 1.02,
            fontWeight: 700,
            letterSpacing: "-1px",
          }}
        >
          The network built for teachers
        </div>
      </div>

      <svg
        width="180"
        height="180"
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
    </div>,
    size,
  );
}
