import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Allowed base directory for all video/frame processing
const ALLOWED_BASE_DIR = path.resolve(process.cwd(), 'temp');

// Shell metacharacters to reject to prevent injection
const SHELL_META_REGEX = /[;|&$`\n]/;

/**
 * Hardened helper to safely spawn Python analysis scripts.
 * Prevents path traversal and shell injection vulnerabilities.
 * 
 * @param scriptName Name of the python script to run
 * @param args Array of arguments to pass
 * @param timeoutMs Execution timeout in milliseconds (default: 120s)
 */
export async function safeSpawnPython(
  scriptName: string, 
  args: string[], 
  timeoutMs: number = 120000
): Promise<string> {
  // 1. Resolve and assert script exists
  const candidates = [
    path.resolve(__dirname, '..', '..', 'scripts', scriptName), // When running from src/lib
    path.resolve(process.cwd(), 'apps', 'api', 'scripts', scriptName), // Fallback
    path.resolve(process.cwd(), 'scripts', scriptName) // Fallback for root execution
  ];
  
  const scriptPath = candidates.find(p => fs.existsSync(p));
  
  if (!scriptPath) {
    throw new Error(`[Security] Script not found: ${scriptName}`);
  }

  // 2. Validate arguments
  for (const arg of args) {
    // Reject shell metacharacters
    if (SHELL_META_REGEX.test(arg)) {
      throw new Error(`[Security] Disallowed shell metacharacter in argument: ${arg}`);
    }

    // Validate path arguments (absolute paths or args containing directory separators)
    if (path.isAbsolute(arg) || arg.includes('/') || arg.includes('\\')) {
      // Allow specific non-path flags that might contain slashes if needed,
      // but typically we should strictly resolve and check boundaries.
      const resolvedPath = path.resolve(arg);
      if (!resolvedPath.startsWith(ALLOWED_BASE_DIR)) {
        throw new Error(`[Security] Path argument traversal attempt. Outside allowed directory: ${resolvedPath}`);
      }
    }
  }

  // 3. ExecFile (safe from shell injection as it doesn't spawn a shell)
  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  
  try {
    const { stdout } = await execFileAsync(pythonBin, [scriptPath, ...args], {
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return stdout;
  } catch (error: any) {
    const stderr = error.stderr || '';
    const stdout = error.stdout || '';
    throw new Error(`[PythonExec] Failed to execute ${scriptName}: ${error.message || error}\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`);
  }
}
