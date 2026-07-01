import { CircleDot, Globe2, RadioTower, ShieldCheck } from "lucide-react";

import { signInAction, signUpAction } from "@/app/actions";
import { SetupRow } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  controlPlaneDescription,
  databaseLabel,
  deploymentModeLabel,
} from "@/lib/runtime-labels";

export function AuthScreen() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-10">
        <section>
          <div className="flex size-11 items-center justify-center rounded-md bg-foreground text-background">
            <RadioTower size={20} />
          </div>
          <h1 className="mt-6 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Open Realtime
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Create the first local owner account to manage apps, credentials,
            webhooks, channels, and usage from the orchestrator.
          </p>
          <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
            <SetupRow icon={ShieldCheck} label="Auth" value="Better Auth" />
            <SetupRow icon={CircleDot} label="DB" value={databaseLabel()} />
            <SetupRow icon={Globe2} label="Mode" value={deploymentModeLabel()} />
          </div>
          <p className="mt-3 max-w-xl text-xs leading-5 text-muted-foreground">
            {controlPlaneDescription()}
          </p>
        </section>

        <Card className="w-full rounded-md">
          <CardContent>
            <h2 className="text-sm font-semibold">Owner access</h2>
            <form action={signUpAction} className="mt-4 space-y-3">
              <AuthInput name="name" placeholder="Dana Khoury" />
              <AuthInput name="email" placeholder="dana@acme.dev" type="email" />
              <AuthInput
                minLength={8}
                name="password"
                placeholder="Password"
                type="password"
              />
              <Button className="w-full rounded-md">Create account</Button>
            </form>

            <Separator className="my-5" />

            <form action={signInAction} className="space-y-3">
              <AuthInput name="email" placeholder="dana@acme.dev" type="email" />
              <AuthInput
                minLength={8}
                name="password"
                placeholder="Password"
                type="password"
              />
              <Button className="w-full rounded-md" variant="outline">
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function AuthInput({
  name,
  placeholder,
  type = "text",
  minLength,
}: {
  name: string;
  placeholder: string;
  type?: string;
  minLength?: number;
}) {
  return (
    <Input
      className="rounded-md"
      minLength={minLength}
      name={name}
      placeholder={placeholder}
      required
      type={type}
    />
  );
}
