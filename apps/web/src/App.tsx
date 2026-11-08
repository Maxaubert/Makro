// App shell: sign-in gate and hash routes. Every screen has its design on the B Night canvas.
import { useApp, useAppState, useRoute } from './lib/hooks';
import { ownerReady } from './lib/owner';
import { Account } from './screens/Account';
import { AddFood } from './screens/AddFood';
import { CustomFood } from './screens/CustomFood';
import { Diary } from './screens/Diary';
import { EditEntry } from './screens/EditEntry';
import { Portion } from './screens/Portion';
import { SignIn } from './screens/SignIn';
import { Today } from './screens/Today';
import { TypeCode } from './screens/TypeCode';
import { Weight } from './screens/Weight';
import { Notice, Page, SecondaryButton } from './ui/kit';

export function App() {
  const app = useApp();
  const { session, authReady, fatal, owner } = useAppState();
  const [screen, a, b] = useRoute();

  if (!authReady) return <Page><div className="flex-1" aria-busy="true" /></Page>;
  if (!session) return <SignIn />;
  if (fatal) {
    return (
      <Page>
        <h1 className="pt-6 text-2xl font-bold">Makro cannot open your log</h1>
        <div className="mt-4"><Notice tone="error">{fatal}</Notice></div>
        <div className="mt-6"><SecondaryButton onClick={() => void app.signOut()}>Sign out</SecondaryButton></div>
      </Page>
    );
  }
  // Until the local log is claimed for this user, show nothing from it.
  if (!ownerReady(session.user.id, owner)) return <Page><div className="flex-1" aria-busy="true" /></Page>;

  switch (screen) {
    case 'diary':
      return <Diary key={a ?? 'today'} date={a} />;
    case 'entry':
      return <EditEntry id={a} />;
    case 'add':
      return <AddFood />;
    case 'portion':
      return <Portion key={`${a}/${b}`} kind={a} id={b} />;
    case 'code':
      return <TypeCode />;
    case 'custom':
      return <CustomFood />;
    case 'weight':
      return <Weight />;
    case 'account':
      return <Account />;
    default:
      return <Today />;
  }
}
