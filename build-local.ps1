# build-local.ps1 - Download Maven once, build all service JARs on Windows host.

$ErrorActionPreference = "Stop"

$MAVEN_VERSION = "3.9.6"
$MAVEN_HOME    = "$env:USERPROFILE\.gozone-maven\apache-maven-$MAVEN_VERSION"
$MAVEN_ZIP     = "$env:TEMP\apache-maven-$MAVEN_VERSION-bin.zip"
$MAVEN_URL     = "https://archive.apache.org/dist/maven/maven-3/$MAVEN_VERSION/binaries/apache-maven-$MAVEN_VERSION-bin.zip"

# ── 1. Install Maven if needed ──────────────────────────────────────────────
if (-not (Test-Path "$MAVEN_HOME\bin\mvn.cmd")) {
    Write-Host "[1/3] Downloading Apache Maven $MAVEN_VERSION (one-time)..."
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $MAVEN_URL -OutFile $MAVEN_ZIP -UseBasicParsing
    Write-Host "      Extracting..."
    New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.gozone-maven" | Out-Null
    Expand-Archive -Path $MAVEN_ZIP -DestinationPath "$env:USERPROFILE\.gozone-maven" -Force
    Remove-Item $MAVEN_ZIP -Force
    Write-Host "      Maven installed at $MAVEN_HOME"
} else {
    Write-Host "[1/3] Maven found at $MAVEN_HOME"
}

# ── 2. Locate real JAVA_HOME (registry → Program Files scan) ────────────────
$javaHome = $null

# Already set and valid?
if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $javaHome = $env:JAVA_HOME
}

# Registry: Oracle / OpenJDK / Adoptium / Microsoft
if (-not $javaHome) {
    $regBases = @(
        "HKLM:\SOFTWARE\JavaSoft\JDK",
        "HKLM:\SOFTWARE\JavaSoft\Java Development Kit",
        "HKLM:\SOFTWARE\Eclipse Adoptium\JDK",
        "HKLM:\SOFTWARE\Eclipse Foundation\JDK",
        "HKLM:\SOFTWARE\Microsoft\JDK"
    )
    foreach ($base in $regBases) {
        if (Test-Path $base) {
            Get-ChildItem $base -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object {
                    if ($javaHome) { return }
                    $jh = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).JavaHome
                    if ($jh -and (Test-Path "$jh\bin\java.exe")) { $javaHome = $jh }
                }
        }
        if ($javaHome) { break }
    }
}

# Fallback: scan common Program Files locations
if (-not $javaHome) {
    $roots = @("$env:ProgramFiles\Java", "$env:ProgramFiles\Eclipse Adoptium",
               "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\BellSoft",
               "$env:ProgramFiles\Azul Systems\Zulu")
    foreach ($root in $roots) {
        if (Test-Path $root) {
            $found = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match "^jdk" } |
                Sort-Object Name -Descending |
                Select-Object -First 1
            if ($found -and (Test-Path "$($found.FullName)\bin\java.exe")) {
                $javaHome = $found.FullName
                break
            }
        }
    }
}

if (-not $javaHome) {
    throw "Cannot locate JAVA_HOME. Please set the JAVA_HOME environment variable to your JDK directory."
}

$env:JAVA_HOME = $javaHome
$env:PATH      = "$MAVEN_HOME\bin;$env:PATH"

Write-Host "      JAVA_HOME = $env:JAVA_HOME"
Write-Host "      $((& "$MAVEN_HOME\bin\mvn.cmd" --version) | Select-Object -First 1)"
Write-Host ""

# ── 3. Build each service JAR ────────────────────────────────────────────────
$SERVICES = @("auth-service", "ride-service", "food-service", "wallet-service", "gateway")
$ROOT = $PSScriptRoot

Write-Host "[2/3] Building service JARs..."

foreach ($svc in $SERVICES) {
    $svcDir = Join-Path $ROOT "services\$svc"
    Write-Host "      -> $svc"
    Push-Location $svcDir
    try {
        & "$MAVEN_HOME\bin\mvn.cmd" package -DskipTests -q
        if ($LASTEXITCODE -ne 0) { throw "mvn package failed for $svc" }
    } finally {
        Pop-Location
    }
    Write-Host "         OK"
}

Write-Host ""
Write-Host "[3/3] All JARs built. Now run:"
Write-Host "      docker compose up --build"
Write-Host ""
