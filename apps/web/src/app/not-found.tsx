"use client";

import Error from "next/error";

// Rendered for requests that do not match any locale (the proxy handles locale routing).
export default function GlobalNotFound() {
  return (
    <html lang="pl">
      <body>
        <Error statusCode={404} />
      </body>
    </html>
  );
}
