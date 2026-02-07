# Supabase Setup (Publishing + History)

This app can run without Supabase (offline mode), but publishing and multi-device history require Supabase.

## 1) Create a Supabase project
- Create a new project in Supabase.
- Get the **Project URL** and **anon public key**.

## 2) Configure in the app
Open **Setup → Supabase** and paste:
- Supabase Project URL
- Supabase anon key

Click **Save & Reload**.

## 3) Create the history table
Run the SQL shown in the Setup screen in the Supabase SQL editor.

## 4) Edge Function (WordPress publish)
This app expects an Edge Function at:

`/functions/v1/wordpress-publish`

If you haven't deployed the function yet, deploy it via Supabase CLI and ensure CORS allows your site.
