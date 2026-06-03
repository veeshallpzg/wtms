# Test Submit Task functionality
$body = @{
    email    = "member1@wtms.local"
    password = "password123"
} | ConvertTo-Json

# Create a session object
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "Testing login..."
$response = Invoke-RestMethod -Uri "http://localhost:8080/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session
Write-Host "Login response:" $response

# Check running timer
Write-Host "`nChecking running timer..."
$runningTimer = Invoke-RestMethod -Uri "http://localhost:8080/api/timer/running" -WebSession $session
Write-Host "Running timer:" ($runningTimer | ConvertTo-Json)

# If no running timer, start one first
if (-not $runningTimer) {
    Write-Host "`nStarting a timer first..."
    $tasks = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks" -WebSession $session
    $pendingTask = $tasks | Where-Object { $_.status -eq "pending" } | Select-Object -First 1
    
    if ($pendingTask) {
        Write-Host "Starting timer for task: $($pendingTask.task_title) (ID: $($pendingTask.id))"
        $startTimer = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks/$($pendingTask.id)/start-timer" -Method POST -ContentType "application/json" -WebSession $session
        Write-Host "Timer started:" ($startTimer | ConvertTo-Json)
        
        # Check timer again
        $runningTimer = Invoke-RestMethod -Uri "http://localhost:8080/api/timer/running" -WebSession $session
        Write-Host "Running timer after start:" ($runningTimer | ConvertTo-Json)
    }
}

if ($runningTimer) {
    # Submit the task
    Write-Host "`nSubmitting task..."
    $taskId = $runningTimer.task_id
    $submitBody = @{
        remarks = "Test submission"
    } | ConvertTo-Json
    
    $submitResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks/$taskId/submit" -Method POST -Body $submitBody -ContentType "application/json" -WebSession $session
    Write-Host "Submit response:" ($submitResponse | ConvertTo-Json)
    
    # Check if timer is stopped
    Write-Host "`nChecking if timer is stopped..."
    $runningTimerAfter = Invoke-RestMethod -Uri "http://localhost:8080/api/timer/running" -WebSession $session
    Write-Host "Running timer after submit:" ($runningTimerAfter | ConvertTo-Json)
    
    # Check task status
    Write-Host "`nChecking task status..."
    $taskDetails = Invoke-RestMethod -Uri "http://localhost:8080/api/tasks/$taskId" -WebSession $session
    Write-Host "Task status:" $taskDetails.task.status
}
else {
    Write-Host "No running timer to submit"
}
