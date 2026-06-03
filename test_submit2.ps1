# Test Submit Task functionality - Simplified
$body = @{
    email    = "member1@wtms.local"
    password = "password123"
} | ConvertTo-Json

# Create a session object
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "Testing login..."
$response = Invoke-RestMethod -Uri "http://localhost:8080/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session
Write-Host "Login OK"

# Get a task ID
Write-Host "`nGetting tasks..."
$tasks = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks" -WebSession $session
Write-Host "Found $($tasks.Count) tasks"

# Find a pending, in_progress or revision_requested task
$taskId = $null
foreach ($t in $tasks) {
    if ($t.status -eq "pending" -or $t.status -eq "in_progress" -or $t.status -eq "revision_requested") {
        $taskId = $t.id
        Write-Host "Found task ID: $taskId, Title: $($t.task_title), Status: $($t.status)"
        break
    }
}

if ($taskId -eq $null) {
    Write-Host "No pending tasks found"
    exit
}

# Start timer
Write-Host "`nStarting timer for task $taskId..."
$startResult = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks/$taskId/start-timer" -Method POST -ContentType "application/json" -WebSession $session
Write-Host "Start result: $($startResult | ConvertTo-Json)"

# Check running timer
Write-Host "`nChecking running timer..."
$running = Invoke-RestMethod -Uri "http://localhost:8080/api/timer/running" -WebSession $session
Write-Host "Running timer: $($running | ConvertTo-Json)"

if ($running) {
    # Submit the task
    Write-Host "`nSubmitting task..."
    $submitBody = @{
        remarks = "Test submission from API"
    } | ConvertTo-Json
    
    $submitUrl = "http://localhost:8080/api/tasks/$($running.task_id)/submit"
    Write-Host "Submit URL: $submitUrl"
    
    $submitResponse = Invoke-RestMethod -Uri $submitUrl -Method POST -Body $submitBody -ContentType "application/json" -WebSession $session
    Write-Host "Submit response: $($submitResponse | ConvertTo-Json)"
    
    # Check if timer is stopped
    Write-Host "`nChecking if timer is stopped..."
    $runningAfter = Invoke-RestMethod -Uri "http://localhost:8080/api/timer/running" -WebSession $session
    Write-Host "Running timer after submit: $($runningAfter | ConvertTo-Json)"
    
    # Check task status
    Write-Host "`nChecking task status..."
    $taskDetails = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks/$($running.task_id)" -WebSession $session
    Write-Host "Task status: $($taskDetails.task.status)"
    Write-Host "Task iterations: $($taskDetails.iterations.Count)"
}
