import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';

const features = [
  {
    icon: '🔑',
    title: 'API Keys',
    description:
      'Generate and manage API keys from the dashboard. Each key is scoped to a project with its own knowledge base.',
    link: '/docs/quickstart',
  },
  {
    icon: '💬',
    title: 'Chat API',
    description:
      'Send messages and get AI-powered responses grounded in your documents via a simple REST endpoint.',
    link: '/docs/api-reference/chat',
  },
  {
    icon: '🔒',
    title: 'Secure by Default',
    description:
      'API keys are stored in an encrypted vault. All internal communication uses timing-safe secret verification.',
    link: '/docs/concepts',
  },
];

const sdkExample = `import { Ragen } from "@webamigos/ragen-sdk-ts";

const ragen = new Ragen();

const completion = await ragen.chat.completions.create({
  assistantId: "123e4567-e89b-12d3-a456-426614174000",
  messages: [
    { role: "user", content: "What is our refund policy?" },
  ],
});

console.log(completion.choices[0].message.content);`;

function HeroSection(): ReactNode {
  return (
    <div className="hero-section">
      <div className="container">
        <h1>Build with Ragen AI</h1>
        <p>
          Integrate AI-powered, knowledge-grounded chat into your application.
          Your documents, your models, your API.
        </p>
        <div className="hero-buttons">
          <Link
            className="button button--primary button--lg"
            to="/docs/quickstart"
          >
            Get Started
          </Link>
          <Link
            className="button button--outline button--lg"
            to="/docs/api-reference/chat"
          >
            API Reference
          </Link>
        </div>
        <div className="code-preview">
          <CodeBlock language="ts">{sdkExample}</CodeBlock>
        </div>
      </div>
    </div>
  );
}

function FeaturesSection(): ReactNode {
  return (
    <div className="features-section">
      <div className="feature-cards">
        {features.map((feature) => (
          <Link
            key={feature.title}
            to={feature.link}
            className="feature-card"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <span className="feature-card__icon">{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Developer Documentation"
      description="Ragen AI developer documentation — API keys, Chat API, and integration guides."
    >
      <main>
        <HeroSection />
        <FeaturesSection />
      </main>
    </Layout>
  );
}
