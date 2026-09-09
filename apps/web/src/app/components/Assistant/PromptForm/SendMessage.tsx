import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

import { Button } from '@ragenai/common-ui/Button';

type Props = {
  disabled: boolean;
};

/**
 * The primary action of the whole product, and it had no accessible name.
 *
 * The icon is `aria-hidden` — correctly, it is decorative — and nothing else
 * named the button, so a screen reader announced "button". An `aria-label`
 * fixes that; the icon stays hidden so the two do not both speak.
 *
 * It was also **green**. `docs/panel-ux-rules.md` reserves green and amber for
 * document or job state and nothing else, and makes navy the only
 * non-destructive action colour, so a green send button spent a state colour
 * on an action and said "ready" where it meant "send".
 */
export const SendMessage = ({ disabled }: Props) => {
  const t = useTranslations('prompt-attachments');

  return (
    <Button
      type="submit"
      aria-label={t('send-message')}
      className="bg-primary hover:bg-primary/90 disabled:bg-primary"
      disabled={disabled}
    >
      <PaperAirplaneIcon
        className="h-5 w-5 flex-none text-primary-foreground cursor-pointer"
        aria-hidden="true"
      />
    </Button>
  );
};
