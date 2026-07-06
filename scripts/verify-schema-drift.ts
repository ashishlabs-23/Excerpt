import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const LOCAL_DB_URL = process.env.LOCAL_DB_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
const PROD_DB_URL = process.env.PROD_DB_URL;

async function getTables(client: Client) {
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  return res.rows.map(r => r.table_name);
}

async function getColumns(client: Client) {
  const res = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name;
  `);
  return res.rows;
}

async function getIndexes(client: Client) {
  const res = await client.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);
  return res.rows;
}

async function getConstraints(client: Client) {
  const res = await client.query(`
    SELECT relname as table_name, conname as constraint_name, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY relname, conname;
  `);
  return res.rows;
}

async function getRPCs(client: Client) {
  const res = await client.query(`
    SELECT p.proname as name, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  `);
  return res.rows;
}

async function getTriggers(client: Client) {
  const res = await client.query(`
    SELECT event_object_table as table_name, trigger_name, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY table_name, trigger_name;
  `);
  return res.rows;
}

async function getPolicies(client: Client) {
  const res = await client.query(`
    SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);
  return res.rows;
}

async function getEnums(client: Client) {
  const res = await client.query(`
    SELECT t.typname, string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) as labels
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `);
  return res.rows;
}

function compareLists(name: string, local: any[], prod: any[], keyFn: (x: any) => string): string {
  const localMap = new Map(local.map(x => [keyFn(x), x]));
  const prodMap = new Map(prod.map(x => [keyFn(x), x]));
  
  const missingInProd = [];
  const missingInLocal = [];
  const mismatched = [];

  for (const [key, localItem] of localMap.entries()) {
    if (!prodMap.has(key)) {
      missingInProd.push(key);
    } else {
      const prodItem = prodMap.get(key);
      if (JSON.stringify(localItem) !== JSON.stringify(prodItem)) {
        mismatched.push(key);
      }
    }
  }

  for (const key of prodMap.keys()) {
    if (!localMap.has(key)) {
      missingInLocal.push(key);
    }
  }

  if (missingInProd.length === 0 && missingInLocal.length === 0 && mismatched.length === 0) {
    return `PASS\n${name}\n`;
  }

  let out = `FAIL\n${name}\n`;
  if (missingInProd.length > 0) out += `- Missing in Prod: ${missingInProd.join(', ')}\n`;
  if (missingInLocal.length > 0) out += `- Missing in Local: ${missingInLocal.join(', ')}\n`;
  if (mismatched.length > 0) out += `- Mismatched Definitions: ${mismatched.join(', ')}\n`;
  
  return out;
}

async function main() {
  if (!PROD_DB_URL) {
    console.error("Missing PROD_DB_URL environment variable.");
    process.exit(1);
  }

  const localClient = new Client({ connectionString: LOCAL_DB_URL });
  const prodClient = new Client({ connectionString: PROD_DB_URL });

  console.log("Connecting to databases...");
  await localClient.connect();
  await prodClient.connect();

  console.log("Fetching schemas...");
  const [
    lTables, pTables,
    lCols, pCols,
    lIdx, pIdx,
    lCons, pCons,
    lRpcs, pRpcs,
    lTrig, pTrig,
    lPol, pPol,
    lEnum, pEnum
  ] = await Promise.all([
    getTables(localClient), getTables(prodClient),
    getColumns(localClient), getColumns(prodClient),
    getIndexes(localClient), getIndexes(prodClient),
    getConstraints(localClient), getConstraints(prodClient),
    getRPCs(localClient), getRPCs(prodClient),
    getTriggers(localClient), getTriggers(prodClient),
    getPolicies(localClient), getPolicies(prodClient),
    getEnums(localClient), getEnums(prodClient)
  ]);

  let report = "# Database Drift Report\n\n";
  let hasFailures = false;

  const results = [
    compareLists("Tables", lTables.map(t => ({name: t})), pTables.map(t => ({name: t})), x => x.name),
    compareLists("Columns", lCols, pCols, x => \`\${x.table_name}.\${x.column_name}\`),
    compareLists("Indexes", lIdx, pIdx, x => \`\${x.tablename}.\${x.indexname}\`),
    compareLists("Constraints", lCons, pCons, x => \`\${x.table_name}.\${x.constraint_name}\`),
    compareLists("RPCs", lRpcs, pRpcs, x => \`\${x.name}(\${x.args})\`),
    compareLists("Triggers", lTrig, pTrig, x => \`\${x.table_name}.\${x.trigger_name}\`),
    compareLists("Policies", lPol, pPol, x => \`\${x.tablename}.\${x.policyname}\`),
    compareLists("Enums", lEnum, pEnum, x => x.typname)
  ];

  for (const r of results) {
    report += r + "\n";
    if (r.startsWith("FAIL")) {
      hasFailures = true;
    }
  }

  fs.writeFileSync(path.join(__dirname, '../DATABASE_DRIFT_REPORT.md'), report);
  console.log("Report generated at DATABASE_DRIFT_REPORT.md");

  await localClient.end();
  await prodClient.end();

  if (hasFailures) {
    console.error("Schema drift detected. See DATABASE_DRIFT_REPORT.md");
    process.exit(1);
  } else {
    console.log("No schema drift detected. Production matches Local.");
  }
}

main().catch(console.error);
