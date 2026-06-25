const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
    console.log("--- SCHEMA AUDIT ---");
    const report = {
        tables: {},
        columns: {},
        rpcs: {}
    };

    const tables = ['jobs', 'clips', 'render_jobs', 'render_cache', 'worker_heartbeats'];
    for (const table of tables) {
        const { error } = await supabase.from(table).select('*').limit(1);
        if (error && error.code === '42P01') {
            report.tables[table] = "MISSING";
            console.log(`[FAIL] Table ${table} is missing.`);
        } else if (error) {
            report.tables[table] = `ERROR: ${error.message}`;
            console.log(`[WARN] Table ${table} error: ${error.message}`);
        } else {
            report.tables[table] = "EXISTS";
            console.log(`[PASS] Table ${table} exists.`);
        }
    }

    const { data: job, error: jobError } = await supabase.from('jobs').select('debug_data, generation_mode').limit(1);
    if (jobError) {
        report.columns['jobs.debug_data'] = "MISSING OR ERROR";
        report.columns['jobs.generation_mode'] = "MISSING OR ERROR";
        console.log(`[FAIL] Columns debug_data/generation_mode missing on jobs: ${jobError.message}`);
    } else {
        report.columns['jobs.debug_data'] = "EXISTS";
        report.columns['jobs.generation_mode'] = "EXISTS";
        console.log(`[PASS] Columns debug_data, generation_mode exist on jobs.`);
    }

    const rpcs = ['claim_next_job', 'claim_next_render_job'];
    for (const rpc of rpcs) {
        // Just call it with a dummy parameter to see if we get a "Could not find function" error
        const { error } = await supabase.rpc(rpc, { worker_id: 'test' });
        if (error && error.message.includes('Could not find')) {
            report.rpcs[rpc] = "MISSING";
            console.log(`[FAIL] RPC ${rpc} is missing.`);
        } else {
            report.rpcs[rpc] = "EXISTS";
            console.log(`[PASS] RPC ${rpc} exists (or threw expected logic error).`);
        }
    }

    const fs = require('fs');
    fs.writeFileSync('SCHEMA_AUDIT_REPORT.md', `# SCHEMA AUDIT REPORT\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
    console.log("Saved SCHEMA_AUDIT_REPORT.md");
}

runAudit();
