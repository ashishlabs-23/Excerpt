const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
    if (error) {
        console.error("Error fetching jobs:", error);
        return;
    }
    const summary = jobs.map(j => ({
        id: j.id,
        status: j.status,
        progress: j.progress,
        locked_by: j.locked_by,
        locked_at: j.locked_at,
        created_at: j.created_at,
        updated_at: j.updated_at,
        video_url: j.video_url
    }));
    console.log("RECENT JOBS SUMMARY:");
    console.log(JSON.stringify(summary, null, 2));
}
check();
