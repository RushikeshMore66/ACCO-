# ACCO Quality & Verification Runner (PowerShell)
# Executes all native test suites, linters, and type checkers across backend and frontend.

$rootDir = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"
$failedSteps = @()

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  ACCO Native Quality & Test Verification" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Backend ruff check
Write-Host "`n[1/6] Running Backend Ruff Linting..." -ForegroundColor Yellow
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
if (Test-Path $pythonExe) {
    & $pythonExe -m ruff check "$backendDir"
    if ($LASTEXITCODE -ne 0) { $failedSteps += "Backend Ruff" }
} else {
    Write-Warning "Virtualenv not found at $pythonExe, skipping backend checks."
    $failedSteps += "Backend Venv Missing"
}

# 2. Backend pytest
Write-Host "`n[2/6] Running Backend Pytest..." -ForegroundColor Yellow
if (Test-Path $pythonExe) {
    Push-Location $backendDir
    & $pythonExe -m pytest
    if ($LASTEXITCODE -ne 0) { $failedSteps += "Backend Pytest" }
    Pop-Location
}

# 3. Frontend npm test
Write-Host "`n[3/6] Running Frontend Tests (npm test)..." -ForegroundColor Yellow
Push-Location $frontendDir
npm test -- --watchAll=false
if ($LASTEXITCODE -ne 0) { $failedSteps += "Frontend Tests" }

# 4. Frontend Typecheck
Write-Host "`n[4/6] Running Frontend Typecheck (npm run typecheck)..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) { $failedSteps += "Frontend Typecheck" }

# 5. Frontend Lint
Write-Host "`n[5/6] Running Frontend Lint (npm run lint)..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) { $failedSteps += "Frontend Lint" }

# 6. Frontend Build
Write-Host "`n[6/6] Running Frontend Production Build (npm run build)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { $failedSteps += "Frontend Build" }
Pop-Location

# Summary
Write-Host "`n=========================================" -ForegroundColor Cyan
if ($failedSteps.Count -eq 0) {
    Write-Host "  ALL CHECKS PASSED SUCCESSFULLY!        " -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "  THE FOLLOWING CHECKS FAILED:           " -ForegroundColor Red
    foreach ($step in $failedSteps) {
        Write-Host "   - $step" -ForegroundColor Red
    }
    Write-Host "=========================================" -ForegroundColor Cyan
    exit 1
}
