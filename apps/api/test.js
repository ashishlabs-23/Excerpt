require('dotenv').config({path: '../../.env'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await supabase.rpc('execute_sql', { 
    query_text: `SELECT 
      (('{}'::jsonb)->>'videoPath' IS NULL OR ('{}'::jsonb)->>'videoPath' !~ '^[A-Za-z]:\\\\|^\\/') AS result_null,
      (('{"videoPath": "C:\\foo"}'::jsonb)->>'videoPath' IS NULL OR ('{"videoPath": "C:\\foo"}'::jsonb)->>'videoPath' !~ '^[A-Za-z]:\\\\|^\\/') AS result_windows,
      (('{"videoPath": "/foo"}'::jsonb)->>'videoPath' IS NULL OR ('{"videoPath": "/foo"}'::jsonb)->>'videoPath' !~ '^[A-Za-z]:\\\\|^\\/') AS result_linux;` 
  });
  console.log('SQL result:', data, error);
})();
