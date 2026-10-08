import { ServerStatus } from '../components/server-status.tsx';

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <h1 className="text-3xl font-bold">Sistema Pollería</h1>
      <ServerStatus />
    </main>
  );
}
