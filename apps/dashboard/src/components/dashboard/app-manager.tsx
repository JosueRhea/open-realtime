"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

import type { RealtimeApp } from "@/lib/orchestrator/types";

export function AppManager() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{
    app: RealtimeApp;
    plainTextSecret: string;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createApp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);
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

      setCreated({ app: body.app, plainTextSecret: body.plainTextSecret });
      setName("");
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

      {created ? (
        <div className="mt-3 rounded-md border border-[#d4ecdb] bg-[#f0faf3] p-3">
          <p className="text-xs font-medium text-[#15803d]">
            Copy this app secret now. It will not be shown again.
          </p>
          <div className="mt-2 space-y-2 text-xs">
            <Credential label="app_id" value={created.app.appId} />
            <Credential label="key" value={created.app.key} />
            <Credential label="secret" value={created.plainTextSecret} />
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[#dc2626]">{error}</p> : null}
    </div>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-[#15803d]">{label}</p>
      <code className="mt-1 block break-all rounded border border-[#d4ecdb] bg-white p-2">
        {value}
      </code>
    </div>
  );
}
