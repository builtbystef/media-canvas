"use client";

import { getGreeting, getHealth } from "@media-canvas/api-client";
import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("checking…");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    getHealth()
      .then(({ data }) => setStatus(data?.status ?? "no data"))
      .catch(() => setStatus("api unreachable"));
    getGreeting({ path: { name: "media-canvas" } })
      .then(({ data }) => setGreeting(data?.message ?? ""))
      .catch(() => setGreeting(""));
  }, []);

  return (
    <main>
      <h1>media-canvas</h1>
      <p>
        API health: <strong>{status}</strong>
      </p>
      {greeting && <p>{greeting}</p>}
    </main>
  );
}
