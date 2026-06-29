import { CircleDot, Globe2, RadioTower, ShieldCheck } from "lucide-react";

import { signInAction, signUpAction } from "@/app/actions";
import { SetupRow } from "@/components/dashboard/ui";

export function AuthScreen() {
  return (
    <main className="min-h-screen bg-[#f5f6f7] text-[#1a1d21]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1fr_420px]">
        <section>
          <div className="flex size-11 items-center justify-center rounded-md bg-[#1a1d21] text-white">
            <RadioTower size={20} />
          </div>
          <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight">
            Open Realtime
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b7280]">
            Create the first local owner account to manage apps, credentials,
            webhooks, channels, and usage from the SQLite-backed orchestrator.
          </p>
          <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
            <SetupRow icon={ShieldCheck} label="Auth" value="Better Auth" />
            <SetupRow icon={CircleDot} label="DB" value="SQLite" />
            <SetupRow icon={Globe2} label="Mode" value="Self-hosted" />
          </div>
        </section>

        <section className="rounded-md border border-[#e7e9ec] bg-white p-5">
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
            <button className="w-full rounded-md bg-[#1a1d21] px-3 py-2 text-sm font-medium text-white">
              Create account
            </button>
          </form>

          <div className="my-5 h-px bg-[#eceef0]" />

          <form action={signInAction} className="space-y-3">
            <AuthInput name="email" placeholder="dana@acme.dev" type="email" />
            <AuthInput
              minLength={8}
              name="password"
              placeholder="Password"
              type="password"
            />
            <button className="w-full rounded-md border border-[#d4d7db] px-3 py-2 text-sm font-medium">
              Sign in
            </button>
          </form>
        </section>
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
    <input
      className="w-full rounded-md border border-[#d4d7db] bg-white px-3 py-2 text-sm outline-none focus:border-[#4f46e5]"
      minLength={minLength}
      name={name}
      placeholder={placeholder}
      required
      type={type}
    />
  );
}
