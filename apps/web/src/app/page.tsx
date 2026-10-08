import Link from 'next/link';
import { ServerStatus } from '../components/server-status.tsx';

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <h1 className="text-3xl font-bold">Sistema Pollería</h1>
      <ServerStatus />
      <Link
        href="/login"
        className="inline-flex min-h-12 items-center text-lg text-accent underline underline-offset-4"
      >
        Iniciar sesión
      </Link>
    </main>
  );
}
