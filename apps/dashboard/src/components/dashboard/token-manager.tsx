"use client";

import { useState } from "react";

import type { ApiToken } from "@/lib/orchestrator/types";

export function TokenManager({ tokens }: { tokens: ApiToken[] }) {
  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [items, setItems] = useState(tokens);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedToken(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, scopes: ["ingest:write", "registry:read"] }),
      });
      const body = (await response.json()) as {
        token?: ApiToken;
        plainTextToken?: string;
        error?: string;
      };

      if (!response.ok || !body.token || !body.plainTextToken) {
        throw new Error(body.error ?? "Unable to create token");
      }

      setItems([body.token, ...items]);
      setCreatedToken(body.plainTextToken);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create token");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      <form className="mt-4 flex gap-2" onSubmit={createToken}>
        <input
          className="min-w-0 flex-1 rounded-md border border-[#d4d7db] bg-white px-3 py-2 text-sm outline-none focus:border-[#4f46e5]"
          name="name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Gateway production"
          required
          value={name}
        />
        <button
          className="rounded-md bg-[#1a1d21] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          disabled={isCreating}
        >
          {isCreating ? "Creating" : "Create token"}
        </button>
      </form>

      {createdToken ? (
        <div className="mt-3 rounded-md border border-[#d4ecdb] bg-[#f0faf3] p-3">
          <p className="text-xs font-medium text-[#15803d]">
            Copy this token now. It will not be shown again.
          </p>
          <code className="mt-2 block break-all rounded border border-[#d4ecdb] bg-white p-2 text-xs">
            {createdToken}
          </code>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[#dc2626]">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-[#d4d7db] bg-[#fafbfc] p-5 text-center">
            <div>
              <p className="text-sm font-medium">No tokens created</p>
              <p className="mt-1 max-w-md text-sm leading-6 text-[#8a9099]">
                Create a scoped token for gateway ingestion and orchestrator
                automation.
              </p>
            </div>
          </div>
        ) : (
          items.map((token) => (
            <div
              className="rounded-md border border-[#eceef0] bg-[#fafbfc] p-3 text-sm"
              key={token.id}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{token.name}</p>
                <span className="text-xs text-[#6b7280]">
                  {token.scopes.join(", ")}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-[#6b7280]">
                {token.tokenPreview}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
