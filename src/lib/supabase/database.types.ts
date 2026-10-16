
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
    },{
      foreignKeyName: "cart_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
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
                },"favorites": {
                  Row: {
                    "created_at": string,"product_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"product_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
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
                },"nova_post_zone_rates": {
                  Row: {
                    "amount_minor": number | null,"created_at": string,"created_by": string | null,"currency": string | null,"updated_at": string,"updated_by": string | null,"zone": string
                  }
                  Insert: {
                    "amount_minor"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"zone": string
                  }
                  Update: {
                    "amount_minor"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"zone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "nova_post_zone_rates_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currency_settings"
      referencedColumns: ["currency"]
    }
                  ]
                },"np_lookups": {
                  Row: {
                    "fetched_at": string,"key": string,"kind": string,"last_used_at": string,"params": NonNullable<Json>,"refs": (string)[]
                  }
                  Insert: {
                    "fetched_at"?: string,"key": string,"kind": string,"last_used_at"?: string,"params": NonNullable<Json>,"refs": (string)[]
                  }
                  Update: {
                    "fetched_at"?: string,"key"?: string,"kind"?: string,"last_used_at"?: string,"params"?: NonNullable<Json>,"refs"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"np_settlements": {
                  Row: {
                    "address_delivery": boolean,"area": string,"city_ref": string,"fetched_at": string,"label": string,"name": string,"ref": string,"region": string,"warehouse_count": number
                  }
                  Insert: {
                    "address_delivery"?: boolean,"area"?: string,"city_ref": string,"fetched_at"?: string,"label": string,"name": string,"ref": string,"region"?: string,"warehouse_count"?: number
                  }
                  Update: {
                    "address_delivery"?: boolean,"area"?: string,"city_ref"?: string,"fetched_at"?: string,"label"?: string,"name"?: string,"ref"?: string,"region"?: string,"warehouse_count"?: number
                  }
                  Relationships: [
                    
                  ]
                },"np_warehouses": {
                  Row: {
                    "city_ref": string,"fetched_at": string,"kind": string,"max_weight_kg": number | null,"name": string,"number": number,"ref": string,"settlement_ref": string,"short_address": string,"type_ref": string
                  }
                  Insert: {
                    "city_ref": string,"fetched_at"?: string,"kind": string,"max_weight_kg"?: number | null,"name": string,"number": number,"ref": string,"settlement_ref": string,"short_address"?: string,"type_ref": string
                  }
                  Update: {
                    "city_ref"?: string,"fetched_at"?: string,"kind"?: string,"max_weight_kg"?: number | null,"name"?: string,"number"?: number,"ref"?: string,"settlement_ref"?: string,"short_address"?: string,"type_ref"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_items": {
                  Row: {
                    "fulfillment": Database["public"]['Enums']["product_fulfillment"],"id": string,"line_total_minor": number,"line_total_usd_minor": number,"order_id": string,"position": number,"product_id": string | null,"quantity": number,"sku": string | null,"title": string,"title_locale": string,"unit_price_minor": number,"unit_price_usd_minor": number,"variant_id": string | null,"variant_label": string | null,"variant_label_locale": string | null
                  }
                  Insert: {
                    "fulfillment": Database["public"]['Enums']["product_fulfillment"],"id"?: string,"line_total_minor": number,"line_total_usd_minor": number,"order_id": string,"position": number,"product_id"?: string | null,"quantity": number,"sku"?: string | null,"title": string,"title_locale": string,"unit_price_minor": number,"unit_price_usd_minor": number,"variant_id"?: string | null,"variant_label"?: string | null,"variant_label_locale"?: string | null
                  }
                  Update: {
                    "fulfillment"?: Database["public"]['Enums']["product_fulfillment"],"id"?: string,"line_total_minor"?: number,"line_total_usd_minor"?: number,"order_id"?: string,"position"?: number,"product_id"?: string | null,"quantity"?: number,"sku"?: string | null,"title"?: string,"title_locale"?: string,"unit_price_minor"?: number,"unit_price_usd_minor"?: number,"variant_id"?: string | null,"variant_label"?: string | null,"variant_label_locale"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "comment": string | null,"country": string,"created_at": string,"currency": string,"currency_decimals": number,"delivery_carrier": string,"delivery_destination": NonNullable<Json>,"delivery_estimate_currency": string | null,"delivery_estimate_decimals": number | null,"delivery_estimate_minor": number | null,"delivery_estimate_source": string | null,"delivery_estimate_state": string,"delivery_method": string,"email": string,"first_name": string,"fx_rate": number,"fx_rate_date": string | null,"id": string,"idempotency_key": string,"items_total_minor": number,"items_total_usd_minor": number,"last_name": string | null,"locale": string,"markup_bps": number,"number": number,"phone": string,"status": Database["public"]['Enums']["order_status"],"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "comment"?: string | null,"country": string,"created_at"?: string,"currency": string,"currency_decimals": number,"delivery_carrier": string,"delivery_destination": NonNullable<Json>,"delivery_estimate_currency"?: string | null,"delivery_estimate_decimals"?: number | null,"delivery_estimate_minor"?: number | null,"delivery_estimate_source"?: string | null,"delivery_estimate_state": string,"delivery_method": string,"email": string,"first_name": string,"fx_rate": number,"fx_rate_date"?: string | null,"id"?: string,"idempotency_key": string,"items_total_minor": number,"items_total_usd_minor": number,"last_name"?: string | null,"locale": string,"markup_bps": number,"number"?: never,"phone": string,"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "comment"?: string | null,"country"?: string,"created_at"?: string,"currency"?: string,"currency_decimals"?: number,"delivery_carrier"?: string,"delivery_destination"?: NonNullable<Json>,"delivery_estimate_currency"?: string | null,"delivery_estimate_decimals"?: number | null,"delivery_estimate_minor"?: number | null,"delivery_estimate_source"?: string | null,"delivery_estimate_state"?: string,"delivery_method"?: string,"email"?: string,"first_name"?: string,"fx_rate"?: number,"fx_rate_date"?: string | null,"id"?: string,"idempotency_key"?: string,"items_total_minor"?: number,"items_total_usd_minor"?: number,"last_name"?: string | null,"locale"?: string,"markup_bps"?: number,"number"?: never,"phone"?: string,"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currency_settings"
      referencedColumns: ["currency"]
    },{
      foreignKeyName: "orders_delivery_estimate_currency_fkey"
      columns: ["delivery_estimate_currency"]
isOneToOne: false
      referencedRelation: "currency_settings"
      referencedColumns: ["currency"]
    }
                  ]
                },"outbox_events": {
                  Row: {
                    "attempts": number,"claim_token": string | null,"created_at": string,"email_status": Database["public"]['Enums']["notification_delivery"],"event": string,"id": string,"last_error": string | null,"next_attempt_at": string,"order_id": string,"payload": NonNullable<Json>,"processed_at": string | null,"telegram_status": Database["public"]['Enums']["notification_delivery"]
                  }
                  Insert: {
                    "attempts"?: number,"claim_token"?: string | null,"created_at"?: string,"email_status"?: Database["public"]['Enums']["notification_delivery"],"event": string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"order_id": string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"telegram_status"?: Database["public"]['Enums']["notification_delivery"]
                  }
                  Update: {
                    "attempts"?: number,"claim_token"?: string | null,"created_at"?: string,"email_status"?: Database["public"]['Enums']["notification_delivery"],"event"?: string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"order_id"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"telegram_status"?: Database["public"]['Enums']["notification_delivery"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbox_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
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
                },"product_taxonomy_terms": {
                  Row: {
                    "created_at": string,"product_id": string,"term_id": string
                  }
                  Insert: {
                    "created_at"?: string,"product_id": string,"term_id": string
                  }
                  Update: {
                    "created_at"?: string,"product_id"?: string,"term_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_taxonomy_terms_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_taxonomy_terms_term_id_fkey"
      columns: ["term_id"]
isOneToOne: false
      referencedRelation: "taxonomy_terms"
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
                },"product_variant_translations": {
                  Row: {
                    "label": string,"locale": string,"source": Database["public"]['Enums']["translation_source"],"variant_id": string
                  }
                  Insert: {
                    "label": string,"locale": string,"source"?: Database["public"]['Enums']["translation_source"],"variant_id": string
                  }
                  Update: {
                    "label"?: string,"locale"?: string,"source"?: Database["public"]['Enums']["translation_source"],"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variant_translations_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"is_available": boolean,"position": number,"price_delta_usd_minor": number,"product_id": string,"sku_suffix": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"is_available"?: boolean,"position"?: number,"price_delta_usd_minor"?: number,"product_id": string,"sku_suffix"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"is_available"?: boolean,"position"?: number,"price_delta_usd_minor"?: number,"product_id"?: string,"sku_suffix"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
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
                    "created_at": string,"first_name": string | null,"id": string,"last_name": string | null,"name": string | null,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"first_name"?: string | null,"id": string,"last_name"?: string | null,"name"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"name"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"saved_addresses": {
                  Row: {
                    "country": string,"created_at": string,"delivery": NonNullable<Json>,"id": string,"is_default": boolean,"label": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "country": string,"created_at"?: string,"delivery": NonNullable<Json>,"id"?: string,"is_default"?: boolean,"label"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "country"?: string,"created_at"?: string,"delivery"?: NonNullable<Json>,"id"?: string,"is_default"?: boolean,"label"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"taxonomy_term_translations": {
                  Row: {
                    "locale": string,"name": string,"source": Database["public"]['Enums']["translation_source"],"term_id": string
                  }
                  Insert: {
                    "locale": string,"name": string,"source"?: Database["public"]['Enums']["translation_source"],"term_id": string
                  }
                  Update: {
                    "locale"?: string,"name"?: string,"source"?: Database["public"]['Enums']["translation_source"],"term_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "taxonomy_term_translations_term_id_fkey"
      columns: ["term_id"]
isOneToOne: false
      referencedRelation: "taxonomy_terms"
      referencedColumns: ["id"]
    }
                  ]
                },"taxonomy_terms": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"kind": Database["public"]['Enums']["taxonomy_kind"],"position": number,"slug": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["taxonomy_kind"],"position"?: number,"slug": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["taxonomy_kind"],"position"?: number,"slug"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_add_product_image":
{ Args: { "p_blur_data_url": string,"p_height": number,"p_product_id": string,"p_storage_path": string,"p_width": number }; Returns: string
                           },
"admin_delete_product":
{ Args: { "p_id": string }; Returns: boolean
                           },
"admin_delete_product_variant":
{ Args: { "p_product_id": string,"p_variant_id": string }; Returns: boolean
                           },
"admin_delete_taxonomy_term":
{ Args: { "p_id": string }; Returns: string
                           },
"admin_reorder_product_images":
{ Args: { "p_image_ids": (string)[],"p_product_id": string }; Returns: undefined
                           },
"admin_reorder_product_variants":
{ Args: { "p_product_id": string,"p_variant_ids": (string)[] }; Returns: undefined
                           },
"admin_save_image_alts":
{ Args: { "p_alts": Json,"p_image_id": string,"p_product_id": string }; Returns: boolean
                           },
"admin_save_product":
{ Args: { "p_id": string,"p_product": Json,"p_translations": Json }; Returns: string
                           },
"admin_save_product_variant":
{ Args: { "p_labels": Json,"p_product_id": string,"p_variant": Json,"p_variant_id": string }; Returns: string
                           },
"admin_save_product_with_terms":
{ Args: { "p_id": string,"p_product": Json,"p_term_ids": (string)[],"p_translations": Json }; Returns: string
                           },
"admin_save_taxonomy_term":
{ Args: { "p_id": string,"p_kind": Database["public"]['Enums']["taxonomy_kind"],"p_names": Json,"p_slug": string }; Returns: string
                           },
"admin_save_variant_labels":
{ Args: { "p_labels": Json,"p_overwrite": boolean,"p_product_id": string }; Returns: number
                           },
"admin_set_product_status":
{ Args: { "p_id": string,"p_status": Database["public"]['Enums']["product_status"] }; Returns: boolean
                           },
"admin_set_product_variant_available":
{ Args: { "p_available": boolean,"p_product_id": string,"p_variant_id": string }; Returns: boolean
                           },
"claim_outbox_events":
{ Args: { "p_lease_seconds": number,"p_limit": number }; Returns: {
              "attempts": number,
"claim_token": string | null,
"created_at": string,
"email_status": Database["public"]['Enums']["notification_delivery"],
"event": string,
"id": string,
"last_error": string | null,
"next_attempt_at": string,
"order_id": string,
"payload": NonNullable<Json>,
"processed_at": string | null,
"telegram_status": Database["public"]['Enums']["notification_delivery"]
            }[]
                          SetofOptions: {
        from: "*"
        to: "outbox_events"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_outbox_event":
{ Args: { "p_claim_token": string,"p_email_status": Database["public"]['Enums']["notification_delivery"],"p_id": string,"p_last_error"?: string,"p_refund_attempt"?: boolean,"p_retry_in_seconds"?: number,"p_telegram_status": Database["public"]['Enums']["notification_delivery"] }; Returns: boolean
                           },
"consume_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_order_request":
{ Args: { "p_items": Json,"p_order": Json }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"np_prune_dictionary":
{ Args: Record<PropertyKey, never>; Returns: {
              "settlements": number,"warehouses": number
            }[]
                           },
"shop_facets":
{ Args: { "p_availability"?: (string)[],"p_category"?: string,"p_colours"?: (string)[],"p_locale": unknown,"p_materials"?: (string)[],"p_price_max_minor"?: number,"p_price_min_minor"?: number,"p_terms"?: (string)[] }; Returns: {
              "count": number,"facet": string,"value": string
            }[]
                           },
"shop_search":
{ Args: { "p_availability"?: (string)[],"p_category"?: string,"p_colours"?: (string)[],"p_limit"?: number,"p_locale": unknown,"p_materials"?: (string)[],"p_offset"?: number,"p_price_max_minor"?: number,"p_price_min_minor"?: number,"p_sort"?: string,"p_terms"?: (string)[] }; Returns: {
              "ids": (string)[],"total": number
            }[]
                           }
          }
          Enums: {
            "notification_delivery": "pending"|"sent"|"skipped_unconfigured"|"skipped_expired"|"failed","order_status": "new"|"pending_payment"|"paid"|"in_processing"|"accepted"|"closed"|"canceled"|"refunded","product_availability": "available"|"reserved"|"sold","product_fulfillment": "made_to_order"|"one_of_a_kind","product_status": "draft"|"published"|"archived","taxonomy_kind": "material"|"colour","translation_source": "human"|"machine","user_role": "customer"|"admin"
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
            "notification_delivery": ["pending", "sent", "skipped_unconfigured", "skipped_expired", "failed"],"order_status": ["new", "pending_payment", "paid", "in_processing", "accepted", "closed", "canceled", "refunded"],"product_availability": ["available", "reserved", "sold"],"product_fulfillment": ["made_to_order", "one_of_a_kind"],"product_status": ["draft", "published", "archived"],"taxonomy_kind": ["material", "colour"],"translation_source": ["human", "machine"],"user_role": ["customer", "admin"]
          }
        }
} as const
