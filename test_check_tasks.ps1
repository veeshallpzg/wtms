$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{email = 'member1@wtms.local'; password = 'password123' } | ConvertTo-Json

Write-Host "Logging in..."
$null = Invoke-RestMethod -Uri 'http://localhost:8080/login' -Method POST -Body $body -ContentType 'application/json' -WebSession $session
Write-Host "Logged in"

Write-Host "`nGetting tasks..."
$tasks = Invoke-RestMethod -Uri 'http://localhost:8080/api/tasks' -WebSession $session

Write-Host "`nAll tasks:"
foreach ($t in $tasks) {
    Write-Host "  ID: $($t.id), Title: $($t.task_title), Status: $($t.status)"
}
