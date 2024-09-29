export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DatabaseGenerated = {
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number;
          checksum: string;
          finished_at: string | null;
          id: string;
          logs: string | null;
          migration_name: string;
          rolled_back_at: string | null;
          started_at: string;
        };
        Insert: {
          applied_steps_count?: number;
          checksum: string;
          finished_at?: string | null;
          id: string;
          logs?: string | null;
          migration_name: string;
          rolled_back_at?: string | null;
          started_at?: string;
        };
        Update: {
          applied_steps_count?: number;
          checksum?: string;
          finished_at?: string | null;
          id?: string;
          logs?: string | null;
          migration_name?: string;
          rolled_back_at?: string | null;
          started_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          content: string | null;
          embedding: string | null;
          id: number;
          metadata: Json | null;
        };
        Insert: {
          content?: string | null;
          embedding?: string | null;
          id?: never;
          metadata?: Json | null;
        };
        Update: {
          content?: string | null;
          embedding?: string | null;
          id?: never;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      documents_123: {
        Row: {
          content: string | null;
          embedding: string | null;
          id: number;
          metadata: Json | null;
        };
        Insert: {
          content?: string | null;
          embedding?: string | null;
          id?: never;
          metadata?: Json | null;
        };
        Update: {
          content?: string | null;
          embedding?: string | null;
          id?: never;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      FlaggedMessage: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          public_id: string;
          role: DatabaseGenerated['public']['Enums']['Role'];
        };
        Insert: {
          content: string;
          created_at?: string;
          id: string;
          public_id: string;
          role?: DatabaseGenerated['public']['Enums']['Role'];
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          public_id?: string;
          role?: DatabaseGenerated['public']['Enums']['Role'];
        };
        Relationships: [];
      };
      Message: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          openai_created_at: number;
          openai_message_id: string;
          public_id: string;
          rate: number | null;
          role: DatabaseGenerated['public']['Enums']['Role'];
          run_id: string | null;
          thread_id: string | null;
          visitor_id: string | null;
        };
        Insert: {
          content: string;
          created_at?: string;
          id: string;
          openai_created_at: number;
          openai_message_id: string;
          public_id: string;
          rate?: number | null;
          role?: DatabaseGenerated['public']['Enums']['Role'];
          run_id?: string | null;
          thread_id?: string | null;
          visitor_id?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          openai_created_at?: number;
          openai_message_id?: string;
          public_id?: string;
          rate?: number | null;
          role?: DatabaseGenerated['public']['Enums']['Role'];
          run_id?: string | null;
          thread_id?: string | null;
          visitor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'Message_thread_id_fkey';
            columns: ['thread_id'];
            isOneToOne: false;
            referencedRelation: 'Thread';
            referencedColumns: ['id'];
          }
        ];
      };
      Thread: {
        Row: {
          created_at: string;
          id: string;
          openai_thread_id: string;
          public_id: string;
          visitor_id: string | null;
        };
        Insert: {
          created_at?: string;
          id: string;
          openai_thread_id: string;
          public_id: string;
          visitor_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          openai_thread_id?: string;
          public_id?: string;
          visitor_id?: string | null;
        };
        Relationships: [];
      };
      User: {
        Row: {
          email: string;
          id: string;
        };
        Insert: {
          email: string;
          id: string;
        };
        Update: {
          email?: string;
          id?: string;
        };
        Relationships: [];
      };
      VisitorMessages: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          visitor_id: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          message_id: string;
          visitor_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          visitor_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      execute_sql: {
        Args: {
          sql_text: string;
        };
        Returns: undefined;
      };
      match_documents: {
        Args: {
          query_embedding: string;
          match_count?: number;
          filter?: Json;
        };
        Returns: {
          id: number;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
    };
    Enums: {
      Role: 'USER' | 'ASSISTANT';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = DatabaseGenerated[Extract<
  keyof DatabaseGenerated,
  'public'
>];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof DatabaseGenerated },
  TableName extends PublicTableNameOrOptions extends {
    schema: keyof DatabaseGenerated;
  }
    ? keyof (DatabaseGenerated[PublicTableNameOrOptions['schema']]['Tables'] &
        DatabaseGenerated[PublicTableNameOrOptions['schema']]['Views'])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof DatabaseGenerated }
  ? (DatabaseGenerated[PublicTableNameOrOptions['schema']]['Tables'] &
      DatabaseGenerated[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
      PublicSchema['Views'])
  ? (PublicSchema['Tables'] &
      PublicSchema['Views'])[PublicTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof DatabaseGenerated },
  TableName extends PublicTableNameOrOptions extends {
    schema: keyof DatabaseGenerated;
  }
    ? keyof DatabaseGenerated[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof DatabaseGenerated }
  ? DatabaseGenerated[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof DatabaseGenerated },
  TableName extends PublicTableNameOrOptions extends {
    schema: keyof DatabaseGenerated;
  }
    ? keyof DatabaseGenerated[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof DatabaseGenerated }
  ? DatabaseGenerated[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema['Enums']
    | { schema: keyof DatabaseGenerated },
  EnumName extends PublicEnumNameOrOptions extends {
    schema: keyof DatabaseGenerated;
  }
    ? keyof DatabaseGenerated[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof DatabaseGenerated }
  ? DatabaseGenerated[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
  ? PublicSchema['Enums'][PublicEnumNameOrOptions]
  : never;
