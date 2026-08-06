import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  const logoSize = 320;
  const logoX = (size.width - logoSize) / 2;
  const logoY = (size.height - logoSize) / 2;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f8fb",
        }}
      >
        <svg
          width={logoSize}
          height={logoSize}
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", left: logoX, top: logoY }}
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
      </div>
    ),
    size,
  );
}
