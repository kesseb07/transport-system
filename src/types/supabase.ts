/**
 * ============================================================================
 * supabase.ts — DATABASE SCHEMA TYPE DEFINITIONS
 * ============================================================================
 *
 * *** AUTO-GENERATED FILE — DO NOT EDIT BY HAND ***
 *
 * This file is produced mechanically by the Supabase CLI, which inspects the
 * live PostgreSQL schema and emits matching TypeScript types:
 *
 *     npx supabase gen types typescript --project-id <id> > src/types/supabase.ts
 *
 * It is therefore a MIRROR of the database, not hand-written source code. It
 * is included in the repository so the project compiles without a database
 * connection. Any manual edit would be silently overwritten the next time the
 * command is run — which is also why this file carries only this header rather
 * than explanatory comments throughout.
 *
 * WHY IT EXISTS
 * -------------
 * These types give the application compile-time safety against the real schema.
 * Because the Supabase client in services/supabaseClient.ts is parameterised
 * with the `Database` type below, TypeScript verifies every query: selecting a
 * column that does not exist, or inserting a string where the column expects a
 * number, becomes a build error rather than a runtime failure.
 *
 * WHAT IT DESCRIBES
 * -----------------
 * Four tables, each with three variants — `Row` (shape when read), `Insert`
 * (shape when creating, with defaults optional) and `Update` (all fields
 * optional for partial edits):
 *
 *   operators  — the bus companies
 *   routes     — origin/destination pairs and fares
 *   schedules  — individual buses; `reserved_seats` drives the dispatch model
 *   bookings   — purchased tickets, with foreign keys to schedules
 *   audit_logs — the tamper-evident regulatory ledger
 *
 * The `Relationships` arrays record the foreign keys enforced by PostgreSQL:
 * a booking must reference a real schedule, and a schedule must reference a
 * real operator and route. This is referential integrity enforced at the
 * database level, independent of application code.
 *
 * The generic helper types at the end of the file (Tables, TablesInsert,
 * TablesUpdate, Enums, CompositeTypes) are convenience utilities emitted by the
 * generator for extracting a specific table's type, e.g. `Tables<'bookings'>`.
 * They are part of the standard generated output and are not all used by this
 * project.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          details: string
          hash: string
          id: string
          timestamp: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          details: string
          hash: string
          id: string
          timestamp?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          details?: string
          hash?: string
          id?: string
          timestamp?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          amount_paid: number
          id: string
          is_validated: boolean | null
          momo_provider: string | null
          momo_transaction_id: string
          passenger_name: string
          passenger_phone: string
          qr_payload: string
          schedule_id: string | null
          seat_number: number
          timestamp: string | null
          validated_at: string | null
        }
        Insert: {
          amount_paid: number
          id: string
          is_validated?: boolean | null
          momo_provider?: string | null
          momo_transaction_id: string
          passenger_name: string
          passenger_phone: string
          qr_payload: string
          schedule_id?: string | null
          seat_number: number
          timestamp?: string | null
          validated_at?: string | null
        }
        Update: {
          amount_paid?: number
          id?: string
          is_validated?: boolean | null
          momo_provider?: string | null
          momo_transaction_id?: string
          passenger_name?: string
          passenger_phone?: string
          qr_payload?: string
          schedule_id?: string | null
          seat_number?: number
          timestamp?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          code: string
          color: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string | null
          id: string
          name: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          base_fare_ghs: number
          created_at: string | null
          destination: string
          distance_km: number
          id: string
          origin: string
        }
        Insert: {
          base_fare_ghs: number
          created_at?: string | null
          destination: string
          distance_km: number
          id: string
          origin: string
        }
        Update: {
          base_fare_ghs?: number
          created_at?: string | null
          destination?: string
          distance_km?: number
          id?: string
          origin?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          bus_number: string
          created_at: string | null
          departure_rate_per_hour: number
          estimated_departure_time: string
          id: string
          operator_id: string | null
          reserved_seats: number[] | null
          route_id: string | null
          scheduled_time: string
          status: string | null
          total_seats: number
        }
        Insert: {
          bus_number: string
          created_at?: string | null
          departure_rate_per_hour: number
          estimated_departure_time: string
          id: string
          operator_id?: string | null
          reserved_seats?: number[] | null
          route_id?: string | null
          scheduled_time: string
          status?: string | null
          total_seats: number
        }
        Update: {
          bus_number?: string
          created_at?: string | null
          departure_rate_per_hour?: number
          estimated_departure_time?: string
          id?: string
          operator_id?: string | null
          reserved_seats?: number[] | null
          route_id?: string | null
          scheduled_time?: string
          status?: string | null
          total_seats?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedules_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
