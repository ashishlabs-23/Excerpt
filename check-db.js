const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: jobs } = await supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(3);
    console.log("RECENT JOBS:");
    console.log(JSON.stringify(jobs, null, 2));

    const { data: clips } = await supabase.from('clips').select('*').order('created_at', { ascending: false }).limit(3);
    console.log("RECENT CLIPS:");
    console.log(JSON.stringify(clips, null, 2));
}
check();
