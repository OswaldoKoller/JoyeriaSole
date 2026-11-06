import { ChangePasswordForm } from './change-password-form.tsx';
import { useCurrentUser } from './use-auth.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

export function AccountPage() {
  useDocumentTitle('Mi cuenta');
  const { data: user } = useCurrentUser();

  return (
    <section className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-stone-600">
          {user?.name} · {user?.email}
        </p>
      </div>
      <ChangePasswordForm />
    </section>
  );
}
