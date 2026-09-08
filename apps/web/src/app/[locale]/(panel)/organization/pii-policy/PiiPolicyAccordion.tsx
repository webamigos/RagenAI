'use client';

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

type Row = {
  label: string;
  masksHeading: string;
  masks: string;
  examplesHeading: string;
  examples: string;
};

type Props = {
  rows: Row[];
};

export function PiiPolicyAccordion({ rows }: Props) {
  return (
    <div className="sm:hidden overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <Accordion
        type="single"
        collapsible
        className="divide-y divide-zinc-200 dark:divide-zinc-700"
      >
        {rows.map((row, i) => (
          <AccordionItem
            key={i}
            value={String(i)}
            className="bg-white dark:bg-zinc-900 border-b-0"
          >
            <AccordionTrigger className="px-4 hover:no-underline text-zinc-900 dark:text-zinc-100">
              {row.label}
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {row.masksHeading}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {row.masks}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {row.examplesHeading}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {row.examples}
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
