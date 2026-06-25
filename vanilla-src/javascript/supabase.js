const SUPABASE_URL =
  "https://iwpeelxmksujrkydfqem.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3cGVlbHhta3N1anJreWRmcWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTAyMjksImV4cCI6MjA5NTcyNjIyOX0.QcyCNRHJ2isTSAZwUgHgOhYQYvuGu6lpG-r9_Lt02fE";
  

window.supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );