type Props = {
  files?: File[];
  content?: string;
  filename?: string;
  organizationId?: string;
  mimeType?: string;
};

export function createFormData({
  files,
  content,
  filename,
  organizationId,
  mimeType = 'text/markdown',
}: Props): FormData {
  const formData = new FormData();

  if (files && files.length > 0) {
    files.forEach((file) => formData.append('files', file));
  }

  if (content && filename) {
    formData.append('files', new File([content], filename, { type: mimeType }));
  }

  if (organizationId) {
    formData.append('organizationId', organizationId);
  }

  return formData;
}
