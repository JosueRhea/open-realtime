"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

import type { RealtimeApp } from "@/lib/orchestrator/types";

export function AppManager() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createApp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as {
        app?: RealtimeApp;
        plainTextSecret?: string;
        error?: string;
      };

      if (!response.ok || !body.app || !body.plainTextSecret) {
        throw new Error(body.error ?? "Unable to create app");
      }

      setName("");
      router.push(`/credentials?app=${encodeURIComponent(body.app.appId)}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create app");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      <form className="mt-4 space-y-3" onSubmit={createApp}>
        <input
          className="w-full rounded-md border border-[#d4d7db] bg-white px-3 py-2 text-sm outline-none focus:border-[#4f46e5]"
          name="name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Production Web"
          required
          value={name}
        />
        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#1a1d21] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={isCreating}
        >
          <Plus size={15} />
          {isCreating ? "Creating app" : "Create app"}
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-[#dc2626]">{error}</p> : null}
    </div>
  );
}
