import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#d97d52",
        borderRadius: 28,
      }}
    >
      <svg
        width="140"
        height="140"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="64" height="64" rx="12" fill="#d97d52" />
        <path d="M8 25 32 13l24 12-24 12L8 25Z" fill="#550527" />
        <path d="M18 31v11c6 8 22 8 28 0V31l-14 7-14-7Z" fill="#fff" />
        <path
          d="M53 27v14"
          fill="none"
          stroke="#9bac5a"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    size,
  );
}
