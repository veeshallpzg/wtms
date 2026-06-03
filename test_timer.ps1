# Test script for WTMS timer functionality
$body = @{
    email    = "member1@wtms.local"
    password = "password123"
} | ConvertTo-Json

# Create a session object
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "Testing login..."
$response = Invoke-RestMethod -Uri "http://localhost:8080/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session
Write-Host "Login response:" $response

# Test /api/user endpoint
Write-Host "`nTesting /api/user..."
try {
    $user = Invoke-RestMethod -Uri "http://localhost:8080/api/user" -WebSession $session
    Write-Host "User: " ($user | ConvertTo-Json)
}
catch {
    Write-Host "Error: " $_.Exception.Message
}

# Test /api/tasks endpoint  
Write-Host "`nTesting /api/tasks..."
try {
    $tasks = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks" -WebSession $session
    Write-Host "Tasks count: " $tasks.Count
    if ($tasks.Count -gt 0) {
        Write-Host "First task: " ($tasks[0] | ConvertTo-Json)
    }
}
catch {
    Write-Host "Error: " $_.Exception.Message
}

# Test starting timer
Write-Host "`nTesting start timer..."
if ($tasks.Count -gt 0) {
    $taskId = $tasks[0].id
    Write-Host "Starting timer for task ID: $taskId"
    try {
        $timerResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks/$taskId/start-timer" -Method POST -ContentType "application/json" -WebSession $session
        Write-Host "Timer response: " ($timerResponse | ConvertTo-Json)
    }
    catch {
        Write-Host "Timer error: " $_.Exception.Message
    }
}
