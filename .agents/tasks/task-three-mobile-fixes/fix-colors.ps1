# PowerShell script to replace hardcoded colors with semantic tokens

$files = @(
    "m\src\features\today\TodayScreen.tsx",
    "m\src\features\today\components\TodayTaskRow.tsx",
    "m\src\features\today\DailyCodingCard.tsx",
    "m\src\features\today\WeightWidgetCard.tsx",
    "m\src\features\today\JournalWidgetCard.tsx",
    "m\src\features\today\components\TaskActionModal.tsx",
    "m\src\features\today\components\CalendarEventsSection.tsx",
    "m\src\features\calendar\CalendarScreen.tsx",
    "m\src\features\notes\NotesScreen.tsx",
    "m\src\features\settings\SettingsScreen.tsx",
    "m\src\features\journal\JournalScreen.tsx",
    "m\src\features\activities\components\ActivityFormModal.tsx",
    "m\src\features\activities\components\SymbolPicker.tsx"
)

foreach ($file in $files) {
    $path = Join-Path "d:\github_projeccts\tracker" $file
    if (Test-Path $path) {
        Write-Host "Processing: $file"
        
        $content = Get-Content -Path $path -Raw
        
        # Replace rgba coral colors
        $content = $content -replace "backgroundColor: 'rgba\(255, 117, 87, 0\.12\)'", "backgroundColor: colors.coralSubtle"
        $content = $content -replace "backgroundColor: 'rgba\(255, 117, 87, 0\.15\)'", "backgroundColor: colors.coralSubtle"
        $content = $content -replace "backgroundColor: 'rgba\(255, 117, 87, 0\.08\)'", "backgroundColor: colors.coralSubtle"
        $content = $content -replace "backgroundColor: 'rgba\(235, 94, 40, 0\.12\)'", "backgroundColor: colors.coralSubtle"
        
        # Replace rgba success colors
        $content = $content -replace "backgroundColor: 'rgba\(34, 197, 94, 0\.15\)'", "backgroundColor: colors.successSubtle"
        $content = $content -replace "backgroundColor: 'rgba\(16, 185, 129, 0\.15\)'", "backgroundColor: colors.successSubtle"
        $content = $content -replace "borderColor: 'rgba\(34, 197, 94, 0\.3\)'", "borderColor: colors.success, opacity: 0.5"
        
        # Replace rgba warning colors
        $content = $content -replace "backgroundColor: 'rgba\(245, 158, 11, 0\.15\)'", "backgroundColor: colors.warningSubtle"
        $content = $content -replace "backgroundColor: 'rgba\(245, 158, 11, 0\.18\)'", "backgroundColor: colors.warningSubtle"
        
        # Replace rgba purple colors
        $content = $content -replace "backgroundColor: 'rgba\(139, 92, 246, 0\.12\)'", "backgroundColor: colors.purple, opacity: 0.12"
        
        # Replace rgba sky/primary colors
        $content = $content -replace "backgroundColor: 'rgba\(56, 189, 248, 0\.15\)'", "backgroundColor: colors.sky, opacity: 0.15"
        $content = $content -replace "backgroundColor: 'rgba\(59, 130, 246, 0\.1\)'", "backgroundColor: colors.primary, opacity: 0.1"
        $content = $content -replace "backgroundColor: 'rgba\(99, 102, 241, 0\.15\)'", "backgroundColor: colors.primarySubtle"
        
        Set-Content -Path $path -Value $content -NoNewline
        Write-Host "  ✓ Completed: $file"
    } else {
        Write-Host "  ✗ Not found: $file"
    }
}

Write-Host "`nColor replacement complete. Manual review recommended."
