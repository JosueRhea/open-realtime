"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/ui";
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
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={createToken}>
        <Input
          className="min-w-0 flex-1"
          name="name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Gateway production"
          required
          value={name}
        />
        <Button className="rounded-md sm:w-auto" disabled={isCreating} size="sm">
          {isCreating ? "Creating" : "Create token"}
        </Button>
      </form>

      {createdToken ? (
        <div className="mt-3 rounded-md border border-primary/20 bg-primary/10 p-3">
          <p className="text-xs font-medium text-primary">
            Copy this token now. It will not be shown again.
          </p>
          <code className="mt-2 block break-all rounded border bg-background p-2 text-xs">
            {createdToken}
          </code>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            body="Create a scoped token for gateway ingestion and orchestrator automation."
            title="No tokens created"
          />
        ) : (
          items.map((token) => (
            <div
              className="rounded-md border bg-muted/40 p-3 text-sm"
              key={token.id}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="font-medium">{token.name}</p>
                <span className="break-words text-xs text-muted-foreground">
                  {token.scopes.join(", ")}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {token.tokenPreview}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
