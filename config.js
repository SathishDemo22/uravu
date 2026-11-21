/* Uravu – cloud settings.
   Fill in the two values from Supabase: Project Settings › API.
   - supabaseUrl:     the "Project URL", e.g. https://abcdefgh.supabase.co
   - supabaseAnonKey: the "anon public" key (also called the publishable key).
   The anon key is meant to be public: Row Level Security is what keeps each person's data private.
   NEVER put the service_role (secret) key here or anywhere in this app.
   Leave both empty and the app works exactly as before: on this device only, no sign-in. */
window.URAVU_CONFIG = {
  supabaseUrl: 'https://rcwvllzugqimuginhhuf.supabase.co',
  supabaseAnonKey: 'sb_publishable_RjD8nnfRRU5-vDpgCt9zqw_rpR5bjCj',
  google: false,        // true once Google sign-in is switched on in Supabase (Authentication › Providers)
};
