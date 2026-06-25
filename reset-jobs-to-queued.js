const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

async function resetToQueued() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
        .from('jobs')
        .update({
            locked_by: null,
            locked_at: null,
            status: 'queued',
            progress: 0,
            payload: {}
        })
        .in('id', ['388e43fd-b266-4f18-9ecc-96d53106a8da']);
    
    if (error) {
        console.error("Error setting status to queued:", error);
    } else {
        console.log("Jobs successfully set to queued!");
    }
}
resetToQueued();
