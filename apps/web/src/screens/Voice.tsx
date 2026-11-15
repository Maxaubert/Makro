// Log by voice: the screen only (decision 52). The rule-based parser, browser speech and on-device Whisper
// were taken out; voice comes back with an AI step the user pays for (their own key, or Sign in with ChatGPT
// once OpenAI opens it). The layout and buttons stay so the next version slots in; none of them act yet.
import { useState } from 'react';
import { MEALS, type Meal } from '../domain/entry';
import { DesktopShell } from '../ui/desktop';
import { Chip, Header, Icon, Page } from '../ui/kit';
import { MEAL_LABEL, mealForNow } from './day';

type Lang = 'nb-NO' | 'en-US';

export function Voice() {
  return (
    <Page>
      <Header title="Log by voice" back="/add" />
      <VoiceLog />
    </Page>
  );
}

export function DesktopVoice() {
  return (
    <DesktopShell active="add" title="Log by voice">
      <div className="max-w-[760px]">
        <VoiceLog />
      </div>
    </DesktopShell>
  );
}

function VoiceLog() {
  const [text, setText] = useState('');
  const [lang, setLang] = useState<Lang>('nb-NO');
  const [meal, setMeal] = useState<Meal>(mealForNow());

  return (
    <div className="mt-2 flex flex-col gap-4">
      <section className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-secondary">Say or type what you ate</span>
          <div className="flex gap-1.5" role="group" aria-label="Language">
            {(['nb-NO', 'en-US'] as const).map((l) => (
              <Chip key={l} selected={lang === l} onClick={() => setLang(l)}>
                {l === 'nb-NO' ? 'Norsk' : 'English'}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <textarea
            aria-label="What you ate"
            data-testid="voice-text"
            className="min-h-[88px] flex-1 resize-none rounded-[14px] bg-raised p-3 text-[16px] leading-snug outline-none placeholder:text-faint"
            placeholder={lang === 'nb-NO' ? 'to egg og 200 g kjøttdeig' : 'two eggs and 200 g minced beef'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" aria-label="Start listening" data-testid="voice-mic" className="tap flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
            <Icon name="mic" size={24} stroke={2} />
          </button>
        </div>
      </section>

      <p className="text-[13px] text-secondary" data-testid="voice-soon">
        Voice logging is being rebuilt. Use search for now.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal">
          {MEALS.map((m) => (
            <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>
              {MEAL_LABEL[m]}
            </Chip>
          ))}
        </div>
        <button type="button" disabled data-testid="voice-log" className="tap ml-auto flex h-12 items-center rounded-full bg-accent px-6 text-[15px] font-bold text-ground disabled:bg-border disabled:text-faint">
          Log
        </button>
      </div>
    </div>
  );
}
