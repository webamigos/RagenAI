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
    <div className="sm:hidden overflow-hidden rounded-lg border border-border">
      <Accordion type="single" collapsible className="divide-y divide-border">
        {rows.map((row, i) => (
          <AccordionItem
            key={i}
            value={String(i)}
            className="bg-card border-b-0"
          >
            <AccordionTrigger className="px-4 hover:no-underline text-foreground">
              {row.label}
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {row.masksHeading}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.masks}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {row.examplesHeading}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
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
