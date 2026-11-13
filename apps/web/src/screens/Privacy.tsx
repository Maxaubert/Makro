// The privacy notice (GDPR Art. 13). Plain words, and it must stay true: change it, and
// CONSENT_TEXT_VERSION, whenever what Makro does with data changes. To be reviewed by a lawyer (#15).
import type { ReactNode } from 'react';
import { Header, Notice, Page } from '../ui/kit';
import { CONSENT_TEXT_VERSION } from '../lib/setup';

/** Filled in by Max before anyone else is invited. */
const CONTROLLER: string | null = null;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-[16px] font-bold">{title}</h2>
      <div className="mt-1.5 flex flex-col gap-2 text-[14px] leading-relaxed text-secondary">{children}</div>
    </section>
  );
}

export function PrivacyBody() {
  return (
    <div className="pb-6">
      <p className="text-[12px] text-secondary">Version {CONSENT_TEXT_VERSION}</p>
      <Section title="Who runs Makro">
        {CONTROLLER ? <p>{CONTROLLER}</p> : <Notice tone="error">Not filled in yet. Makro must not be offered to anyone new until it is.</Notice>}
      </Section>
      <Section title="What Makro stores">
        <p>Your email address, sex, birth year, height, weight, activity level, goals, the foods you log and the foods you create. This can say something about your health, so Makro only stores it if you agree.</p>
      </Section>
      <Section title="Why, and on what basis">
        <p>To let you track your food and weight against your goals and use them on your devices. The legal basis is your explicit consent (GDPR Art. 6(1)(a) and 9(2)(a)).</p>
        <p>When Makro cannot find a food, it sends an anonymous report so the food can be added: the barcode or the words you searched for, the food you made for it (if any), your country, and the app and database version. The report has no account or user id and is not linked to you. Your network address is used only in scrambled form, to limit how many reports can be sent in an hour.</p>
        <p>Optional: if you agree separately, the foods you log count toward totals of which foods are popular, which helps order search results. Only totals are shared, never who logged what. Saying no changes nothing else.</p>
      </Section>
      <Section title="Where it is, and who handles it">
        <p>Your data is stored with Supabase in Frankfurt, in the EU. Vercel delivers the website itself. Both are service providers, and both are US-linked companies, so data can be reached from outside the EU under their contract terms.</p>
        <p>The people running Makro have technical access to the database. There is no advertising, and no analytics service.</p>
      </Section>
      <Section title="How long it is kept">
        <p>Until you delete your account. Deleting it removes your data from the server.</p>
      </Section>
      <Section title="Your rights">
        <p>You can withdraw consent at any time, as easily as you gave it, in Account. You can also see, correct, download or delete your data, and restrict or object to how it is used. What was done before you withdrew stays lawful.</p>
        <p>You can complain to Datatilsynet, the Norwegian data protection authority.</p>
      </Section>
      <Section title="What the numbers are">
        <p>You must be 18 or older. Calorie and macro goals are estimates from a formula, not medical advice. No decision with legal or similar effect is made about you automatically.</p>
      </Section>
    </div>
  );
}

export function Privacy() {
  return (
    <Page>
      <Header title="Privacy" back="/account" />
      <PrivacyBody />
    </Page>
  );
}
