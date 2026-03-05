import type { ReactNode } from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';

type Props = {
  preview: string;
  children: ReactNode;
};

const LOGO_URL = 'http://app.ragen.ai/assets/ragen-logo-on-light-bg.svg';

export const EmailLayout = ({ preview, children }: Props) => (
  <Html>
    <Head />
    <Preview>{preview}</Preview>
    <Tailwind>
      <Body className="bg-[#f6f9fc] font-sans">
        <Container className="mx-auto mb-16 bg-white py-5 pb-12">
          <Section className="px-12">
            <Img src={LOGO_URL} width={180} height={64} alt="Ragen AI" />
            <Hr className="my-5 border-[#e6ebf1]" />
            {children}
            <Hr className="my-5 border-[#e6ebf1]" />
            <Text className="text-xs leading-4 text-[#8898aa]">
              Ragen AI by Web Amigos
            </Text>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
