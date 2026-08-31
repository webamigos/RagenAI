import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
} from 'docx';
import type { CreateDocxFileParams } from './docgen-types';

const HEADING_MAP: Record<
  number,
  (typeof HeadingLevel)[keyof typeof HeadingLevel]
> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
};

export async function createDocxFile(
  params: CreateDocxFileParams,
): Promise<string> {
  const children: Paragraph[] = [];

  for (const section of params.sections) {
    const headingLevel = HEADING_MAP[section.level] || HeadingLevel.HEADING_2;

    children.push(
      new Paragraph({
        heading: headingLevel,
        children: [new TextRun({ text: section.title, bold: true })],
      }),
    );

    const paragraphs = section.content.split('\n\n');
    for (const para of paragraphs) {
      if (!para.trim()) {
        continue;
      }
      children.push(
        new Paragraph({
          children: [new TextRun(para.trim())],
          spacing: { after: 200 },
        }),
      );
    }
  }

  // Add footer with generation timestamp
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 600 },
      children: [
        new TextRun({
          text: `Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          italics: true,
          size: 18,
          color: '888888',
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer).toString('base64');
}
