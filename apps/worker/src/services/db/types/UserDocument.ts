export interface UserDocument {
  id: string;
  organization_id: string;
  title: string;
  content: string;
  created_at: Date | null;
  updated_at: Date | null;
  file_id: string | null;
  project_id: string | null;
}
