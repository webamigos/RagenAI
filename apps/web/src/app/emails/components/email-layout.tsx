import type { ReactNode } from 'react';
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

import type { EmailBranding } from '@/features/branding/contracts/branding.types';

type Props = {
  preview: string;
  /** The language of the message, for the `lang` of the document. */
  locale: string;
  /**
   * The install's branding (spec B2). Absent — a preview, a test, a caller
   * that does not pass it — is today's Ragen branding.
   */
  branding?: EmailBranding;
  children: ReactNode;
};

const LOGO_URL = 'https://app.ragen.ai/assets/ragen-logo-on-light-bg.svg';

/**
 * The top of every email: the install's logo, its name when it has a name
 * and no logo, or Ragen's logo.
 *
 * An uploaded logo is held by height and capped in width, since its
 * proportions are the operator's. A mail client has no stylesheet for
 * `object-fit`, so the width is left to the image's own ratio.
 */
function Masthead({ branding }: { branding?: EmailBranding }) {
  if (branding?.logoUrl) {
    return (
      <Img
        src={branding.logoUrl}
        height={48}
        alt={branding.productName}
        style={{ maxWidth: 240, height: 48, width: 'auto' }}
      />
    );
  }
  if (branding?.isCustom) {
    return (
      <Heading as="h1" className="m-0 text-2xl font-semibold text-[#1c244b]">
        {branding.productName}
      </Heading>
    );
  }
  return <Img src={LOGO_URL} width={186} height={64} alt="Ragen AI" />;
}

export const EmailLayout = ({ preview, locale, branding, children }: Props) => (
  <Html lang={locale}>
    <Head />
    <Preview>{preview}</Preview>
    <Tailwind>
      <Body className="bg-[#f6f9fc] font-sans">
        <Container className="mx-auto mb-16 bg-card py-5 pb-12">
          <Section className="px-12">
            <Masthead branding={branding} />
            <Hr className="my-5 border-[#e6ebf1]" />
            {children}
            <Hr className="my-5 border-[#e6ebf1]" />
            <Text className="text-xs leading-4 text-[#8898aa]">
              {/* The vendor line is Ragen's own; a branded install signs
                  with its own name. */}
              {branding?.isCustom
                ? branding.productName
                : 'Ragen AI by Web Amigos'}
            </Text>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
