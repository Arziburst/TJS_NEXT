
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "categories": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"slug": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"position"?: number,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"category_translations": {
                  Row: {
                    "category_id": string,"locale": string,"name": string,"source": Database["public"]['Enums']["translation_source"]
                  }
                  Insert: {
                    "category_id": string,"locale": string,"name": string,"source"?: Database["public"]['Enums']["translation_source"]
                  }
                  Update: {
                    "category_id"?: string,"locale"?: string,"name"?: string,"source"?: Database["public"]['Enums']["translation_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_translations_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"product_image_alts": {
                  Row: {
                    "alt": string,"image_id": string,"locale": string
                  }
                  Insert: {
                    "alt": string,"image_id": string,"locale": string
                  }
                  Update: {
                    "alt"?: string,"image_id"?: string,"locale"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_image_alts_image_id_fkey"
      columns: ["image_id"]
isOneToOne: false
      referencedRelation: "product_images"
      referencedColumns: ["id"]
    }
                  ]
                },"product_images": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"product_id": string,"storage_path": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"position"?: number,"product_id": string,"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"product_id"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_images_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_translations": {
                  Row: {
                    "alt_text": string | null,"description": string | null,"locale": string,"meta_description": string | null,"meta_title": string | null,"product_id": string,"reviewed_at": string | null,"slug": string,"source": Database["public"]['Enums']["translation_source"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "alt_text"?: string | null,"description"?: string | null,"locale": string,"meta_description"?: string | null,"meta_title"?: string | null,"product_id": string,"reviewed_at"?: string | null,"slug": string,"source"?: Database["public"]['Enums']["translation_source"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "alt_text"?: string | null,"description"?: string | null,"locale"?: string,"meta_description"?: string | null,"meta_title"?: string | null,"product_id"?: string,"reviewed_at"?: string | null,"slug"?: string,"source"?: Database["public"]['Enums']["translation_source"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_translations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "available": boolean,"care": string | null,"category_id": string,"created_at": string,"hs_code": string,"id": string,"materials": string | null,"price_usd": number,"updated_at": string,"weight_g": number
                  }
                  Insert: {
                    "available"?: boolean,"care"?: string | null,"category_id": string,"created_at"?: string,"hs_code"?: string,"id"?: string,"materials"?: string | null,"price_usd": number,"updated_at"?: string,"weight_g"?: number
                  }
                  Update: {
                    "available"?: boolean,"care"?: string | null,"category_id"?: string,"created_at"?: string,"hs_code"?: string,"id"?: string,"materials"?: string | null,"price_usd"?: number,"updated_at"?: string,"weight_g"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"id": string,"role": Database["public"]['Enums']["user_role"]
                  }
                  Insert: {
                    "created_at"?: string,"id": string,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            "translation_source": "human"|"machine","user_role": "customer"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "translation_source": ["human", "machine"],"user_role": ["customer", "admin"]
          }
        }
} as const
