export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      comments: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: number
          parent_id: number | null
          sheet_difficulty: string
          sheet_type: Database['public']['Enums']['sheet_type']
          song_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: number
          parent_id?: number | null
          sheet_difficulty: string
          sheet_type: Database['public']['Enums']['sheet_type']
          song_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: number
          parent_id?: number | null
          sheet_difficulty?: string
          sheet_type?: Database['public']['Enums']['sheet_type']
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'comments_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'comments_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'comments'
            referencedColumns: ['id']
          }
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      song_aliases: {
        Row: {
          created_at: string
          created_by: string
          id: number
          name: string
          song_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: number
          name: string
          song_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: number
          name?: string
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'song_aliases_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      tag_groups: {
        Row: {
          color: string
          created_at: string
          id: number
          localized_name: Json
        }
        Insert: {
          color: string
          created_at?: string
          id?: number
          localized_name: Json
        }
        Update: {
          color?: string
          created_at?: string
          id?: number
          localized_name?: Json
        }
        Relationships: []
      }
      tag_songs: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          sheet_difficulty: string
          sheet_type: Database['public']['Enums']['sheet_type']
          song_id: string
          tag_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          sheet_difficulty: string
          sheet_type: Database['public']['Enums']['sheet_type']
          song_id: string
          tag_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          sheet_difficulty?: string
          sheet_type?: Database['public']['Enums']['sheet_type']
          song_id?: string
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'public_tag_songs_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tag_songs_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          }
        ]
      }
      tags: {
        Row: {
          created_at: string
          created_by: string
          group_id: number
          id: number
          localized_description: Json
          localized_name: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          group_id: number
          id?: number
          localized_description?: Json
          localized_name?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          group_id?: number
          id?: number
          localized_description?: Json
          localized_name?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'public_tags_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'tag_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tags_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      sheet_difficulty: 'basic' | 'advanced' | 'expert' | 'master' | 'remaster'
      sheet_type: 'std' | 'dx' | 'utage' | 'utage2p'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])
  ? (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends keyof PublicSchema['Enums'] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
  ? PublicSchema['Enums'][PublicEnumNameOrOptions]
  : never
