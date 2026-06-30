# Launches the FastAPI backend and the Vite dev server in two new windows.
# Usage:  ./dev.ps1
$root = $PSScriptRoot

Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "cd '$root\backend'; python -m uvicorn main:app --port 8000 --reload"
)
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "cd '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "  APEX terminal starting..." -ForegroundColor Green
Write-Host "  Backend : http://localhost:8000"
Write-Host "  Frontend: http://localhost:5173"
Write-Host ""
