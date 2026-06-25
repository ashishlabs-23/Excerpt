# start_and_test.ps1
Stop-Process -Name node, nodemon -Force -ErrorAction SilentlyContinue

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $repoRoot "apps\api"
$webDir = Join-Path $repoRoot "apps\web"
$apiUrl = "http://localhost:8010"

Write-Host "Starting API server..."
$apiJob = Start-Job -ScriptBlock { 
    param($dir)
    cd $dir
    npm run dev > api.log 2>&1 
} -ArgumentList $apiDir

Write-Host "Starting Web server..."
$webJob = Start-Job -ScriptBlock { 
    param($dir)
    cd $dir
    npm run dev > web.log 2>&1 
} -ArgumentList $webDir

# Wait for API to be ready
$maxRetries = 30
$retryCount = 0

while ($retryCount -lt $maxRetries) {
    try {
        $response = Invoke-RestMethod -Uri "$apiUrl/health" -Method Get -ErrorAction Stop
        if ($response.status -eq "OK") {
            Write-Host "API is ready!"
            break
        }
    } catch {
        $retryCount++
        Write-Host "Waiting for API... ($retryCount/$maxRetries)"
        Start-Sleep -Seconds 2
    }
}

if ($retryCount -eq $maxRetries) {
    Write-Error "API failed to start in time. Check apps/api/api.log"
    exit 1
}

# Submit job
Write-Host "Submitting job..."
$jobResponse = Invoke-RestMethod -Method Post -Uri "$apiUrl/api/video/generate-clips" `
    -ContentType "application/json" `
    -Body '{"videoUrl": "https://www.youtube.com/watch?v=9AY_Jpm_42Y", "numClips": 5}'

Write-Host "Job Submitted: $($jobResponse.jobId)"
Write-Host "Status: $($jobResponse.message)"

# Monitor for a bit
Start-Sleep -Seconds 10
Invoke-RestMethod -Method Get -Uri "$apiUrl/api/video/status/$($jobResponse.jobId)"
