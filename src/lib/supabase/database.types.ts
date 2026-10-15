
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "cart_items": {
                  Row: {
                    "created_at": string,"id": string,"product_id": string,"quantity": number,"updated_at": string,"user_id": string,"variant_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"product_id": string,"quantity": number,"updated_at"?: string,"user_id"?: string,"variant_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"product_id"?: string,"quantity"?: number,"updated_at"?: string,"user_id"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"position": number,"slug": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"position"?: number,"slug": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"position"?: number,"slug"?: string,"updated_at"?: string,"updated_by"?: string | null
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
                },"currency_settings": {
                  Row: {
                    "currency": string,"decimals": number,"enabled": boolean,"ending": number,"hysteresis_bps": number,"markup_bps": number,"round_increment": number,"small_ending": number | null,"small_price_below": number | null,"small_round_increment": number | null
                  }
                  Insert: {
                    "currency": string,"decimals": number,"enabled"?: boolean,"ending": number,"hysteresis_bps"?: number,"markup_bps"?: number,"round_increment": number,"small_ending"?: number | null,"small_price_below"?: number | null,"small_round_increment"?: number | null
                  }
                  Update: {
                    "currency"?: string,"decimals"?: number,"enabled"?: boolean,"ending"?: number,"hysteresis_bps"?: number,"markup_bps"?: number,"round_increment"?: number,"small_ending"?: number | null,"small_price_below"?: number | null,"small_round_increment"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"fx_rates": {
                  Row: {
                    "base": string,"fetched_at": string,"id": number,"quote": string,"rate": number,"rate_date": string,"source": string
                  }
                  Insert: {
                    "base": string,"fetched_at"?: string,"id"?: never,"quote": string,"rate": number,"rate_date": string,"source": string
                  }
                  Update: {
                    "base"?: string,"fetched_at"?: string,"id"?: never,"quote"?: string,"rate"?: number,"rate_date"?: string,"source"?: string
                  }
                  Relationships: [
                    
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
                    "blur_data_url": string | null,"created_at": string,"created_by": string | null,"height": number,"id": string,"position": number,"product_id": string,"storage_path": string,"updated_at": string,"updated_by": string | null,"width": number
                  }
                  Insert: {
                    "blur_data_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"height": number,"id"?: string,"position"?: number,"product_id": string,"storage_path": string,"updated_at"?: string,"updated_by"?: string | null,"width": number
                  }
                  Update: {
                    "blur_data_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"height"?: number,"id"?: string,"position"?: number,"product_id"?: string,"storage_path"?: string,"updated_at"?: string,"updated_by"?: string | null,"width"?: number
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
                    "alt_text": string | null,"care": string | null,"clasp": string | null,"created_at": string,"created_by": string | null,"description": string | null,"lead_time_note": string | null,"locale": string,"materials": string | null,"meta_description": string | null,"meta_title": string | null,"product_id": string,"reviewed_at": string | null,"search_vector": unknown,"slug": string,"source": Database["public"]['Enums']["translation_source"],"title": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "alt_text"?: string | null,"care"?: string | null,"clasp"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"lead_time_note"?: string | null,"locale": string,"materials"?: string | null,"meta_description"?: string | null,"meta_title"?: string | null,"product_id": string,"reviewed_at"?: string | null,"search_vector"?: never,"slug": string,"source"?: Database["public"]['Enums']["translation_source"],"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "alt_text"?: string | null,"care"?: string | null,"clasp"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"lead_time_note"?: string | null,"locale"?: string,"materials"?: string | null,"meta_description"?: string | null,"meta_title"?: string | null,"product_id"?: string,"reviewed_at"?: string | null,"search_vector"?: never,"slug"?: string,"source"?: Database["public"]['Enums']["translation_source"],"title"?: string,"updated_at"?: string,"updated_by"?: string | null
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
                    "availability": Database["public"]['Enums']["product_availability"],"category_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fulfillment": Database["public"]['Enums']["product_fulfillment"],"height_mm": number | null,"hs_code": string,"id": string,"lead_time_max_days": number | null,"lead_time_min_days": number | null,"legacy_id": string | null,"length_mm": number | null,"position": number,"price_usd": number,"published_at": string | null,"sku": string | null,"status": Database["public"]['Enums']["product_status"],"updated_at": string,"updated_by": string | null,"weight_g": number,"width_mm": number | null
                  }
                  Insert: {
                    "availability"?: Database["public"]['Enums']["product_availability"],"category_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fulfillment"?: Database["public"]['Enums']["product_fulfillment"],"height_mm"?: number | null,"hs_code"?: string,"id"?: string,"lead_time_max_days"?: number | null,"lead_time_min_days"?: number | null,"legacy_id"?: string | null,"length_mm"?: number | null,"position"?: number,"price_usd": number,"published_at"?: string | null,"sku"?: string | null,"status"?: Database["public"]['Enums']["product_status"],"updated_at"?: string,"updated_by"?: string | null,"weight_g"?: number,"width_mm"?: number | null
                  }
                  Update: {
                    "availability"?: Database["public"]['Enums']["product_availability"],"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fulfillment"?: Database["public"]['Enums']["product_fulfillment"],"height_mm"?: number | null,"hs_code"?: string,"id"?: string,"lead_time_max_days"?: number | null,"lead_time_min_days"?: number | null,"legacy_id"?: string | null,"length_mm"?: number | null,"position"?: number,"price_usd"?: number,"published_at"?: string | null,"sku"?: string | null,"status"?: Database["public"]['Enums']["product_status"],"updated_at"?: string,"updated_by"?: string | null,"weight_g"?: number,"width_mm"?: number | null
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
                    "created_at": string,"id": string,"name": string | null,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id": string,"name"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_delete_product":
{ Args: { "p_id": string }; Returns: boolean
                           },
"admin_save_product":
{ Args: { "p_id": string,"p_product": Json,"p_translations": Json }; Returns: string
                           },
"admin_set_product_status":
{ Args: { "p_id": string,"p_status": Database["public"]['Enums']["product_status"] }; Returns: boolean
                           },
"consume_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            "product_availability": "available"|"reserved"|"sold","product_fulfillment": "made_to_order"|"one_of_a_kind","product_status": "draft"|"published"|"archived","translation_source": "human"|"machine","user_role": "customer"|"admin"
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
            "product_availability": ["available", "reserved", "sold"],"product_fulfillment": ["made_to_order", "one_of_a_kind"],"product_status": ["draft", "published", "archived"],"translation_source": ["human", "machine"],"user_role": ["customer", "admin"]
          }
        }
} as const
