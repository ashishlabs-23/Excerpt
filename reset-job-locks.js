const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

async function resetLocks() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
        .from('jobs')
        .update({
            locked_by: null,
            locked_at: null,
            status: 'pending',
            progress: 0
        })
        .in('id', ['d2f16a1d-0889-4c8c-b740-9bc4897b3465', '388e43fd-b266-4f18-9ecc-96d53106a8da']);
    
    if (error) {
        console.error("Error resetting locks:", error);
    } else {
        console.log("Locks successfully reset to pending!");
    }
}
resetLocks();
