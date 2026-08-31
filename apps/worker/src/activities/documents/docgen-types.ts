export type DocumentSection = {
  title: string;
  content: string;
  level: number;
};

export type GenerateDocumentContentParams = {
  templateName: string;
  rawInput: Record<string, unknown>;
  clientName: string;
  orgId: string;
};

export type CreateDocxFileParams = {
  sections: DocumentSection[];
  clientName: string;
  templateName: string;
};

export type UploadToGoogleDriveParams = {
  docxBase64: string;
  fileName: string;
  driveFolderId: string;
  driveAccessToken: string;
};

export type UploadToGoogleDriveResult = {
  fileId: string;
  fileUrl: string;
  fileName: string;
};
