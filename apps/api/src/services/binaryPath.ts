import path from 'path';
import fs from 'fs';

const binaryPathCache = new Map<string, string>();

function findBinaryUnder(rootDir: string, binaryName: string, maxDepth = 3): string | null {
  if (!rootDir || !fs.existsSync(rootDir)) return null;

  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === binaryName.toLowerCase()) {
        return fullPath;
      }

      if (entry.isDirectory() && current.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

function getWindowsBinaryCandidates(name: string): string[] {
  if (process.platform !== 'win32') return [];

  const executable = `${name}.exe`;
  const localAppData = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';
  const commonCandidates = [
    path.join(localAppData, 'Microsoft', 'WinGet', 'Links', executable),
    path.join(userProfile, 'scoop', 'shims', executable),
    path.join('C:\\ffmpeg', 'bin', executable),
    path.join('C:\\Program Files', 'ffmpeg', 'bin', executable),
    path.join('C:\\Program Files (x86)', 'ffmpeg', 'bin', executable),
  ];

  if (name === 'yt-dlp') {
    commonCandidates.push(
      path.join(
        localAppData,
        'Microsoft',
        'WinGet',
        'Packages',
        'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe',
        executable
      )
    );
  }

  const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  const detected = findBinaryUnder(wingetPackages, executable, 4);
  if (detected) {
    commonCandidates.push(detected);
  }

  return commonCandidates.filter((candidate, index, all) => {
    return all.indexOf(candidate) === index && fs.existsSync(candidate);
  });
}

// Helper to get binary path with Windows fallbacks for local development
export const getBinaryPath = (name: string): string => {
  const cached = binaryPathCache.get(name);
  if (cached) return cached;

  const envKey = `${name.toUpperCase().replace(/-/g, '_')}_PATH`;
  const envPath = process.env[envKey];
  if (envPath && fs.existsSync(envPath)) {
    binaryPathCache.set(name, envPath);
    return envPath;
  }

  // Inside Docker, they are in the system path
  if (process.env.NODE_ENV === 'production') return name;

  // Local relative fallback for Windows dev
  const relativePath = path.join(__dirname, '..', '..', 'bin', `${name}.exe`);
  if (fs.existsSync(relativePath)) {
    binaryPathCache.set(name, relativePath);
    return relativePath;
  }

  const windowsCandidate = getWindowsBinaryCandidates(name)[0];
  if (windowsCandidate) {
    binaryPathCache.set(name, windowsCandidate);
    return windowsCandidate;
  }

  return name; // Fallback to system PATH
};
