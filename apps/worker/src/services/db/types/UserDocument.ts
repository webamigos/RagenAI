export interface UserDocument {
  id: string;
  organization_id: string;
  title: string;
  content: string;
  /** Free-form per-document data; currently holds the optimization job. */
  metadata: unknown;
  created_at: Date | null;
  updated_at: Date | null;
  file_id: string | null;
  project_id: string | null;
}
