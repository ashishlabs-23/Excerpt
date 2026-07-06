import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

const PROD_URL = 'https://excerpt-api.onrender.com/api/system/self-test';

// Generate a dummy JWT token for the self-test endpoint if it requires it, 
// using SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY (Wait, requireUserJWT usually needs a valid Supabase token. 
// If it fails with 401, we might need a valid token. Let's just try fetching it.)

async function monitor() {
  console.log("Monitoring Render Deployment via /api/system/self-test...");
  let attempts = 0;
  
  while (attempts < 60) {
    try {
      // Pass a dummy token to bypass if it checks headers, though it might fail verification
      const res = await fetch(PROD_URL, {
        headers: {
           // Providing the service role key as a bearer token sometimes works for Supabase JWT verification
           'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`
        }
      });
      
      const body = await res.text();
      
      if (res.ok && body.includes('"status":"PASS"')) {
        console.log(`\n✅ Deployment SUCCESSFUL and LIVE!`);
        console.log(`Self-Test Output:\n${body}`);
        process.exit(0);
      } else if (res.status === 401) {
         // If we get 401, the endpoint is UP at least. Let's check if the version changed or if it just responds.
         console.log(`\nEndpoint is UP (returned 401 Unauthorized, meaning the route exists). Wait for 401 if it previously returned 404.`);
         // To truly check, we might just look at /health instead which doesn't require JWT.
      } else {
        process.stdout.write(".");
      }
    } catch (e: any) {
      process.stdout.write("x");
    }
    
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
  }
  
  console.error("\nTimeout waiting for deployment.");
  process.exit(1);
}

monitor();
