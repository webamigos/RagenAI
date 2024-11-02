export type PropsWihLocale = {
  params: {
    locale: string;
  };
};

export type VectorStoreDocumentMetadata = {
  file_name: string;
  page_number: number;
  created_at: string;
  id: number;
  organization_id: string;
  file_id: string;
};

export type VectorStoreMetadataFilter = Partial<VectorStoreDocumentMetadata>;
