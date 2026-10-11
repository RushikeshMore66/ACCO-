# ACCO Development Runner (PowerShell)
# Launches native backend and frontend development servers.

param (
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$rootDir = Split-Path -Parent $PSScriptRoot

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  ACCO Native Development Launcher       " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

if (-not $FrontendOnly) {
    Write-Host "[1/2] Starting Backend (FastAPI on http://localhost:8000)..." -ForegroundColor Green
    $backendDir = Join-Path $rootDir "backend"
    $pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
    
    if (-not (Test-Path $pythonExe)) {
        Write-Warning "Python virtualenv not found at '$pythonExe'. Please run 'python -m venv venv' inside backend/."
    } else {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; .\venv\Scripts\activate; uvicorn app.main:app --reload --port 8000"
        Write-Host "Backend server opened in a new PowerShell window." -ForegroundColor Gray
    }
}

if (-not $BackendOnly) {
    Write-Host "[2/2] Starting Frontend (Next.js on http://localhost:3000)..." -ForegroundColor Green
    $frontendDir = Join-Path $rootDir "frontend"
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; npm run dev"
    Write-Host "Frontend server opened in a new PowerShell window." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Backend Docs: http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "Frontend App: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Done!" -ForegroundColor Cyan
