// Koppeling met Supabase. URL en sleutel vind je in Supabase > Project Settings > API.
// De "anon public" sleutel is bedoeld om in een website te staan; de beveiliging zit in de database-regels.
window.AIIB_CONFIG = {
  supabaseUrl: 'https://vuxjuudfdkekktxoqhgo.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1eGp1dWRmZGtla2t0eG9xaGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjYzNDYsImV4cCI6MjEwNzcwMjM0Nn0.FkKRPI2Jy91FsBXFAzftrfasMK_UPt12cxsiQgl6S2Y',
  // De toegangsgebruikers uit Authentication > Users. Het ingevulde wachtwoord wordt bij elk ervan geprobeerd;
  // welke rol erbij hoort, staat alleen in de database.
  toegang: [
    'toegang1@ai-initiatievenbank.nl',
    'toegang2@ai-initiatievenbank.nl',
    'toegang3@ai-initiatievenbank.nl',
  ],
};
