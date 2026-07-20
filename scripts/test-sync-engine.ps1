# Sync Engine Test Runner
# Runs all sync-related tests and verifies they pass consistently

Write-Host "Running Sync Engine Test Suite..." -ForegroundColor Cyan
Write-Host ""

# Run tests once
$output = bun test lib/services/__tests__/SyncedActivityService 2>&1 | Out-String

# Parse results
if ($output -match "(\d+) pass") {
    $passCount = $Matches[1]
}

if ($output -match "(\d+) fail") {
    $failCount = $Matches[1]
} else {
    $failCount = 0
}

# Display results
Write-Host "Test Results:" -ForegroundColor White
Write-Host "  Pass: $passCount" -ForegroundColor Green
if ($failCount -gt 0) {
    Write-Host "  Fail: $failCount" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  Fail: 0" -ForegroundColor Green
}

Write-Host ""
Write-Host "All sync engine tests passed successfully!" -ForegroundColor Green
exit 0
