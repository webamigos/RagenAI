import { createDocxFile } from '../create-docx-file';
import type { DocumentSection } from '../docgen-types';

describe('createDocxFile', () => {
  const baseSections: DocumentSection[] = [
    {
      title: 'Workshop Summary — Acme Corp',
      content: 'Overview of the workshop.',
      level: 1,
    },
    {
      title: 'Key Discussion Points',
      content: 'We discussed topic A.\n\nWe also discussed topic B.',
      level: 2,
    },
    { title: 'Action Items', content: 'John to follow up on X.', level: 2 },
  ];

  it('returns a valid base64-encoded DOCX', async () => {
    const result = await createDocxFile({
      sections: baseSections,
      clientName: 'Acme Corp',
      templateName: 'workshop-summary',
    });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    // Verify it decodes to a valid buffer with DOCX/ZIP magic bytes (PK)
    const buffer = Buffer.from(result, 'base64');
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  it('handles sections with different heading levels', async () => {
    const sections: DocumentSection[] = [
      { title: 'Main Title', content: 'Intro.', level: 1 },
      { title: 'Section', content: 'Details.', level: 2 },
      { title: 'Subsection', content: 'More details.', level: 3 },
    ];

    const result = await createDocxFile({
      sections,
      clientName: 'Test',
      templateName: 'workshop-summary',
    });

    const buffer = Buffer.from(result, 'base64');
    expect(buffer[0]).toBe(0x50);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('handles empty sections array', async () => {
    const result = await createDocxFile({
      sections: [],
      clientName: 'Test',
      templateName: 'workshop-summary',
    });

    expect(typeof result).toBe('string');
    const buffer = Buffer.from(result, 'base64');
    expect(buffer[0]).toBe(0x50);
  });

  it('handles sections with multi-paragraph content', async () => {
    const sections: DocumentSection[] = [
      {
        title: 'Discussion',
        content: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
        level: 2,
      },
    ];

    const result = await createDocxFile({
      sections,
      clientName: 'Test',
      templateName: 'workshop-summary',
    });

    const buffer = Buffer.from(result, 'base64');
    expect(buffer.length).toBeGreaterThan(100);
  });
});
