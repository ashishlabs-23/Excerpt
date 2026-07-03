import { config } from 'dotenv';
config({ path: 'apps/api/.env' });
import { DatabaseService } from './apps/api/src/services/supabaseService.js';
import { JobStateMachine, JobStatus } from './apps/api/src/utils/JobStateMachine.js';

async function run() {
  const db = new DatabaseService();
  const jobId = 'e356924c-e28f-4417-aa58-8fd39505ad00'; // one of the failed jobs
  try {
    await JobStateMachine.transition(db, jobId, JobStatus.PROCESSING, { progress: 15 });
    console.log("Success");
  } catch (err: any) {
    console.error("Caught error:", err.message);
  }
}
run();
