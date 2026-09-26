import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ufjntksuwklourvsagca.supabase.co'
const supabaseAnonKey = 'sb_publishable_mYyovbH-l6RRl4ePcTd4-w_Jef4r4Sb'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)